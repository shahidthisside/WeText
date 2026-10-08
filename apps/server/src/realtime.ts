import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { DB } from './db.js';
import { config } from './config.js';
import { hashToken } from './lib/crypto.js';
import type { UserRow } from './types.js';

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * Socket.IO layer. Each authenticated socket joins `user:<id>`; presence is
 * tracked as a per-user socket count and broadcast to `presence:<id>` rooms
 * that interested clients join via `presence:watch`.
 */
export class Realtime {
  io: Server | null = null;
  private sockets = new Map<string, number>();

  constructor(private db: DB) {}

  attach(server: HttpServer) {
    const io = new Server(server, {
      path: '/socket.io',
      cors: config.isProd ? undefined : { origin: config.webOrigin, credentials: true },
    });
    this.io = io;

    io.use(async (socket, next) => {
      const token = parseCookie(socket.handshake.headers.cookie, config.sessionCookie);
      if (!token) return next(new Error('unauthorized'));
      try {
        const row = (await this.db
          .prepare(
            'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?',
          )
          .get(hashToken(token), Date.now())) as UserRow | undefined;
        if (!row) return next(new Error('unauthorized'));
        socket.data.userId = row.id;
        socket.data.sessionId = hashToken(token);
        next();
      } catch {
        next(new Error('unavailable'));
      }
    });

    io.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: Socket) {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.join(`session:${socket.data.sessionId}`);

    const prev = this.sockets.get(userId) ?? 0;
    this.sockets.set(userId, prev + 1);
    if (prev === 0) void this.broadcastPresence(userId, true);

    socket.on('presence:watch', async (ids: unknown) => {
      const parsed = z.array(z.string().max(32)).max(200).safeParse(ids);
      if (!parsed.success) return;
      for (const room of socket.rooms) if (room.startsWith('presence:')) socket.leave(room);
      for (const id of parsed.data) socket.join(`presence:${id}`);
      try {
        socket.emit('presence:snapshot', await this.visiblePresence(parsed.data));
      } catch {
        /* presence is best-effort */
      }
    });

    socket.on('typing', async (payload: unknown) => {
      const parsed = z.object({ conversationId: z.string().max(32) }).safeParse(payload);
      if (!parsed.success) return;
      try {
        const members = (await this.db
          .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL')
          .pluck()
          .all(parsed.data.conversationId)) as string[];
        if (!members.includes(userId)) return;
        for (const m of members) {
          if (m !== userId) this.emitToUser(m, 'typing', { conversationId: parsed.data.conversationId, userId });
        }
      } catch {
        /* typing indicators are best-effort */
      }
    });

    // Voice-note recording indicator: relayed to the other active members only.
    socket.on('recording', async (payload: unknown) => {
      const parsed = z.object({ conversationId: z.string().max(32), on: z.boolean() }).safeParse(payload);
      if (!parsed.success) return;
      try {
        const members = (await this.db
          .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL')
          .pluck()
          .all(parsed.data.conversationId)) as string[];
        if (!members.includes(userId)) return;
        for (const m of members) {
          if (m !== userId) this.emitToUser(m, 'recording', { conversationId: parsed.data.conversationId, userId, on: parsed.data.on });
        }
      } catch {
        /* recording indicators are best-effort */
      }
    });

    socket.on('disconnect', async () => {
      const n = (this.sockets.get(userId) ?? 1) - 1;
      if (n <= 0) {
        this.sockets.delete(userId);
        try {
          await this.db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), userId);
        } catch {
          /* closing: the database may already be gone */
        }
        await this.broadcastPresence(userId, false);
      } else {
        this.sockets.set(userId, n);
      }
    });
  }

  private async visiblePresence(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = (await this.db
      .prepare(`SELECT id, show_online, last_seen_at FROM users WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)) as Pick<UserRow, 'id' | 'show_online' | 'last_seen_at'>[];
    return rows.map((r) =>
      r.show_online
        ? { userId: r.id, online: this.isOnline(r.id), lastSeenAt: r.last_seen_at }
        : { userId: r.id, online: false, lastSeenAt: null },
    );
  }

  private async broadcastPresence(userId: string, online: boolean) {
    try {
      const row = (await this.db.prepare('SELECT show_online, last_seen_at FROM users WHERE id = ?').get(userId)) as
        | Pick<UserRow, 'show_online' | 'last_seen_at'>
        | undefined;
      if (!row?.show_online) return;
      this.io?.to(`presence:${userId}`).emit('presence', { userId, online, lastSeenAt: row.last_seen_at });
    } catch {
      /* presence is best-effort */
    }
  }

  isOnline(userId: string) {
    return (this.sockets.get(userId) ?? 0) > 0;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.io?.to(`user:${userId}`).emit(event, payload);
  }

  /** Force-disconnect sockets tied to a revoked session. */
  disconnectSession(sessionId: string) {
    this.io?.in(`session:${sessionId}`).disconnectSockets(true);
  }

  disconnectUser(userId: string) {
    this.io?.in(`user:${userId}`).disconnectSockets(true);
  }

  close() {
    this.io?.close();
  }
}
