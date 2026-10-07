import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { newId } from '../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { normalizeText } from '../lib/text.js';
import { uploadUrl } from '../lib/validation.js';
import { canStartConversation, followStatus, isBlockedEither } from '../services/graph.js';
import { presenceOf, userSummary } from '../services/users.js';
import type { Ctx, UserRow } from '../types.js';

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  image_w: number | null;
  image_h: number | null;
  reply_to_id: string | null;
  created_at: number;
  deleted_at: number | null;
}

interface MemberRow {
  conversation_id: string;
  user_id: string;
  last_read_at: number;
  cleared_at: number;
  muted: number;
}

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'] as const;

export async function messageViews(ctx: Ctx, rows: MessageRow[]) {
  if (!rows.length) return [];
  const { db } = ctx;
  const ids = JSON.stringify(rows.map((r) => r.id));
  const reactions = (await db
    .prepare('SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (SELECT value FROM json_each(?)) ORDER BY created_at')
    .all(ids)) as { message_id: string; user_id: string; emoji: string }[];
  const replyIds = rows.map((r) => r.reply_to_id).filter(Boolean) as string[];
  const replies = new Map(
    replyIds.length
      ? ((await db.prepare('SELECT * FROM messages WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(replyIds))) as MessageRow[]).map(
          (m) => [m.id, m],
        )
      : [],
  );
  return rows.map((m) => {
    const rx = new Map<string, string[]>();
    for (const r of reactions) if (r.message_id === m.id) rx.set(r.emoji, [...(rx.get(r.emoji) ?? []), r.user_id]);
    const reply = m.reply_to_id ? replies.get(m.reply_to_id) : undefined;
    const deleted = !!m.deleted_at;
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      body: deleted ? '' : m.body,
      image: !deleted && m.image_url ? { url: m.image_url, width: m.image_w ?? 0, height: m.image_h ?? 0 } : null,
      replyTo: m.reply_to_id
        ? reply
          ? { id: reply.id, senderId: reply.sender_id, body: reply.deleted_at ? '' : reply.body.slice(0, 140), hasImage: !!reply.image_url, deleted: !!reply.deleted_at }
          : { id: m.reply_to_id, senderId: null, body: '', hasImage: false, deleted: true }
        : null,
      createdAt: m.created_at,
      deleted,
      reactions: deleted ? [] : [...rx.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
    };
  });
}

export type MessageView = Awaited<ReturnType<typeof messageViews>>[number];

async function isRequestFor(ctx: Ctx, convId: string, viewerId: string, otherId: string): Promise<boolean> {
  const sent = await ctx.db.prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ? LIMIT 1').get(convId, viewerId);
  if (sent) return false;
  return (await followStatus(ctx.db, viewerId, otherId)) !== 'active';
}

/** Unread conversations (primary inbox) + count of pending message requests. */
export async function unreadMessageCounts(ctx: Ctx, userId: string) {
  const rows = (await ctx.db
    .prepare(
      `SELECT c.id, o.user_id AS other_id,
         EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ?1
                  AND m.created_at > me.last_read_at AND m.created_at > me.cleared_at AND m.deleted_at IS NULL) AS unread,
         EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at > me.cleared_at) AS has_messages
       FROM conversation_members me
       JOIN conversations c ON c.id = me.conversation_id
       JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id != ?1
       WHERE me.user_id = ?1 AND me.muted = 0`,
    )
    .all({ 1: userId })) as { id: string; other_id: string; unread: number; has_messages: number }[];
  let conversations = 0;
  let requests = 0;
  for (const r of rows) {
    if (!r.has_messages || await isBlockedEither(ctx.db, userId, r.other_id)) continue;
    if (await isRequestFor(ctx, r.id, userId, r.other_id)) requests++;
    else if (r.unread) conversations++;
  }
  return { conversations, requests };
}

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  async function membership(convId: string, userId: string) {
    const me = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, userId)) as
      | MemberRow
      | undefined;
    if (!me) throw notFound('Conversation not found');
    const other = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(convId, userId)) as
      | MemberRow
      | undefined;
    const otherUser = other ? ((await db.prepare('SELECT * FROM users WHERE id = ?').get(other.user_id)) as UserRow | undefined) : undefined;
    return { me, other, otherUser };
  }

  async function conversationView(convId: string, viewer: UserRow) {
    const { me, other, otherUser } = await membership(convId, viewer.id);
    if (!other || !otherUser) return null;
    const last = (await db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
      .get(convId, me.cleared_at)) as MessageRow | undefined;
    const unread = (
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND created_at > ? AND created_at > ? AND deleted_at IS NULL`,
        )
        .get(convId, viewer.id, me.last_read_at, me.cleared_at)) as { n: number }
    ).n;
    const blocked = await isBlockedEither(db, viewer.id, otherUser.id);
    const blockedByMe = !!await db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(viewer.id, otherUser.id);
    return {
      id: convId,
      other: { ...userSummary(otherUser), ...(blocked ? { isOnline: false, lastSeenAt: null } : presenceOf(ctx, otherUser)) },
      lastMessage: last ? (await messageViews(ctx, [last]))[0]! : null,
      unread,
      isRequest: await isRequestFor(ctx, convId, viewer.id, otherUser.id),
      muted: !!me.muted,
      otherLastReadAt: other.last_read_at,
      canSend: !blocked,
      blockedByMe,
      updatedAt: last?.created_at ?? 0,
    };
  }

  app.get('/conversations', async (req) => {
    const user = requireUser(req);
    const { tab } = z.object({ tab: z.enum(['primary', 'requests']).default('primary') }).parse(req.query);
    const ids = (await db
      .prepare(
        `SELECT c.id FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id
          WHERE me.user_id = ? ORDER BY c.last_message_at DESC LIMIT 200`,
      )
      .pluck()
      .all(user.id)) as string[];
    const all = (await Promise.all(ids.map((id) => conversationView(id, user)))).filter((c): c is NonNullable<typeof c> => !!c);
    const items = all.filter((c) => {
      // Hidden when cleared and nothing new since. A conversation you started stays visible even before the first message.
      if (!c.lastMessage) return false;
      if (tab === 'requests') return c.isRequest && !c.blockedByMe;
      return !c.isRequest;
    });
    return { items };
  });

  app.post('/conversations', async (req) => {
    const user = requireUser(req);
    const { username } = z.object({ username: z.string().max(30) }).parse(req.body);
    const other = (await db.prepare('SELECT * FROM users WHERE username = ?').get(username.replace(/^@/, ''))) as UserRow | undefined;
    if (!other) throw notFound('This account doesn’t exist');
    const key = [user.id, other.id].sort().join(':');
    const existing = (await db.prepare('SELECT id FROM conversations WHERE pair_key = ?').get(key)) as { id: string } | undefined;
    if (existing) {
      if (await isBlockedEither(db, user.id, other.id)) throw forbidden("You can't message this account");
      return { conversation: (await conversationView(existing.id, user)) };
    }
    const check = await canStartConversation(db, user, other);
    if (!check.ok) throw forbidden(check.reason);
    const id = newId();
    const now = Date.now();
    await db.transaction(async () => {
      await db.prepare('INSERT INTO conversations (id, pair_key, created_at, last_message_at) VALUES (?, ?, ?, ?)').run(id, key, now, now);
      await db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)').run(id, user.id, id, other.id);
    });
    return { conversation: (await conversationView(id, user)) };
  });

  app.get('/conversations/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const view = await conversationView(id, user);
    if (!view) throw notFound('Conversation not found');
    return { conversation: view };
  });

  app.patch('/conversations/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const body = z.object({ muted: z.boolean() }).parse(req.body);
    await membership(id, user.id);
    await db.prepare('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?').run(body.muted ? 1 : 0, id, user.id);
    return { conversation: (await conversationView(id, user)) };
  });

  /** "Delete" for me: hides history before now; the other person keeps theirs. */
  app.delete('/conversations/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    await membership(id, user.id);
    const now = Date.now();
    await db.prepare('UPDATE conversation_members SET cleared_at = ?, last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(now, now, id, user.id);
    return { ok: true };
  });

  app.get('/conversations/:id/messages', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const q = z.object({ before: z.coerce.number().optional() }).parse(req.query);
    const { me } = await membership(id, user.id);
    const rows = (await db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? AND created_at > ? AND created_at < ?
          ORDER BY created_at DESC LIMIT 41`,
      )
      .all(id, me.cleared_at, q.before ?? Number.MAX_SAFE_INTEGER)) as MessageRow[];
    const page = rows.slice(0, 40).reverse();
    return { items: await messageViews(ctx, page), hasMore: rows.length > 40 };
  });

  app.post(
    '/conversations/:id/messages',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = requireUser(req);
      const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
      const body = z
        .object({
          body: z.string().max(4000).default(''),
          image: z.object({ url: uploadUrl, width: z.number().int().positive(), height: z.number().int().positive() }).nullish(),
          replyToId: z.string().max(32).nullish(),
        })
        .parse(req.body);
      const text = normalizeText(body.body);
      if (!text && !body.image) throw badRequest('Message is empty');
      if (text.length > 2000) throw badRequest('Messages can be at most 2000 characters');
      if (body.image && !body.image.url.startsWith(`/uploads/${user.id}/`)) throw forbidden('Invalid upload');
      const { other, otherUser } = await membership(id, user.id);
      if (!other || !otherUser) throw badRequest('This account no longer exists');
      if (await isBlockedEither(db, user.id, otherUser.id)) throw forbidden("You can't message this account");
      if (body.replyToId && !await db.prepare('SELECT 1 FROM messages WHERE id = ? AND conversation_id = ?').get(body.replyToId, id)) {
        throw badRequest('The message you replied to no longer exists');
      }

      const mid = newId();
      const now = Date.now();
      await db.transaction(async () => {
        await db.prepare(
          `INSERT INTO messages (id, conversation_id, sender_id, body, image_url, image_w, image_h, reply_to_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(mid, id, user.id, text, body.image?.url ?? null, body.image?.width ?? null, body.image?.height ?? null, body.replyToId ?? null, now);
        await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(now, id);
        // Sending implies you've read everything up to now.
        await db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(now, id, user.id);
      });
      const msg = (await messageViews(ctx, [(await db.prepare('SELECT * FROM messages WHERE id = ?').get(mid)) as MessageRow]))[0]!;
      ctx.rt.emitToUser(user.id, 'message:new', { conversationId: id, message: msg });
      ctx.rt.emitToUser(otherUser.id, 'message:new', { conversationId: id, message: msg });
      return reply.code(201).send({ message: msg });
    },
  );

  app.post('/conversations/:id/read', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { other } = await membership(id, user.id);
    const now = Date.now();
    await db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(now, id, user.id);
    ctx.rt.emitToUser(user.id, 'conversation:read', { conversationId: id, userId: user.id, at: now });
    if (other) ctx.rt.emitToUser(other.user_id, 'conversation:read', { conversationId: id, userId: user.id, at: now });
    return { ok: true };
  });

  async function loadOwnMessage(messageId: string, userId: string) {
    const m = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)) as MessageRow | undefined;
    if (!m) throw notFound('Message not found');
    const { other } = await membership(m.conversation_id, userId);
    return { m, other };
  }

  async function broadcastUpdate(m: MessageRow, userId: string, otherId?: string) {
    const fresh = (await messageViews(ctx, [(await db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id)) as MessageRow]))[0]!;
    ctx.rt.emitToUser(userId, 'message:updated', { conversationId: m.conversation_id, message: fresh });
    if (otherId) ctx.rt.emitToUser(otherId, 'message:updated', { conversationId: m.conversation_id, message: fresh });
    return fresh;
  }

  app.delete('/messages/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { m, other } = await loadOwnMessage(id, user.id);
    if (m.sender_id !== user.id) throw forbidden('You can only unsend your own messages');
    await db.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
    await db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(id);
    return { message: (await broadcastUpdate(m, user.id, other?.user_id)) };
  });

  app.put('/messages/:id/reaction', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { emoji } = z.object({ emoji: z.enum(REACTIONS).nullable() }).parse(req.body);
    const { m, other } = await loadOwnMessage(id, user.id);
    if (m.deleted_at) throw badRequest('Message was unsent');
    if (other && await isBlockedEither(db, user.id, other.user_id)) throw forbidden();
    if (emoji) {
      await db.prepare(
        'INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at',
      ).run(id, user.id, emoji, Date.now());
    } else {
      await db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?').run(id, user.id);
    }
    return { message: (await broadcastUpdate(m, user.id, other?.user_id)) };
  });
};

export default routes;
