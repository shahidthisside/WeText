import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { config } from '../config.js';
import { newId } from '../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { cursor, decodeCursor, encodeCursor } from '../lib/validation.js';
import { canViewAuthor, isBlockedEither } from '../services/graph.js';
import type { PostRow, UserRow } from '../types.js';

const REASONS = ['spam', 'abuse', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other'] as const;

const reportSchema = z.object({
  targetType: z.enum(['post', 'user', 'message']),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REASONS),
  details: z.string().trim().max(500).optional(),
});

/** 20 reports an hour per account; generous for genuine use, a brake on abuse. */
const reportRateLimit = { config: { rateLimit: { max: config.isTest ? 1000 : 20, timeWindow: '1 hour' } } };

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  app.post('/reports', reportRateLimit, async (req) => {
    const me = requireUser(req);
    const body = reportSchema.parse(req.body);
    const details = body.details ?? '';

    // The target must exist and be something the reporter is allowed to see. You can't report
    // yourself or your own post. Messages: the reporter must be a member of the conversation.
    if (body.targetType === 'user') {
      if (body.targetId === me.id) throw badRequest('You can’t report yourself');
      const u = (await db.prepare('SELECT * FROM users WHERE id = ?').get(body.targetId)) as UserRow | undefined;
      if (!u) throw notFound('This account doesn’t exist');
      // A blocked-either-way account is reportable (you may be reporting the person who blocked you),
      // but a private account you can't otherwise see is not surfaced as reportable.
      if (!(await isBlockedEither(db, me.id, u.id)) && !(await canViewAuthor(db, me.id, u))) {
        throw notFound('This account doesn’t exist');
      }
    } else if (body.targetType === 'post') {
      const post = (await db.prepare('SELECT * FROM posts WHERE id = ?').get(body.targetId)) as PostRow | undefined;
      if (!post) throw notFound('This post doesn’t exist');
      if (post.author_id === me.id) throw badRequest('You can’t report your own post');
      const author = (await db.prepare('SELECT * FROM users WHERE id = ?').get(post.author_id)) as UserRow;
      const visible = post.is_anonymous
        ? !(await isBlockedEither(db, me.id, author.id))
        : await canViewAuthor(db, me.id, author);
      if (!visible) throw notFound('This post is unavailable');
    } else {
      // message: read the messages table directly (no import from routes/messages.ts) and require
      // the reporter to be a member of the conversation that message belongs to.
      const msg = (await db.prepare('SELECT id, conversation_id, sender_id FROM messages WHERE id = ?').get(body.targetId)) as
        | { id: string; conversation_id: string; sender_id: string }
        | undefined;
      if (!msg) throw notFound('This message doesn’t exist');
      if (msg.sender_id === me.id) throw badRequest('You can’t report your own message');
      const member = await db
        .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
        .get(msg.conversation_id, me.id);
      if (!member) throw forbidden('You can’t report this message');
    }

    // Idempotent per (reporter, type, target): a repeat updates the reason/details and returns 200.
    const existing = (await db
      .prepare('SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?')
      .get(me.id, body.targetType, body.targetId)) as { id: string } | undefined;
    if (existing) {
      await db.prepare('UPDATE reports SET reason = ?, details = ?, created_at = ? WHERE id = ?').run(
        body.reason, details, Date.now(), existing.id,
      );
      return { ok: true };
    }
    await db.prepare(
      'INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(newId(), me.id, body.targetType, body.targetId, body.reason, details, Date.now());
    return { ok: true };
  });

  /**
   * Admin-only review of submitted reports. The single account whose username matches
   * ADMIN_USERNAME (config.adminUsername) may read them; everyone else gets 403, and if no admin
   * is configured the endpoint behaves as if it doesn't exist (404) for everyone.
   */
  app.get('/admin/reports', async (req) => {
    const me = requireUser(req);
    if (!config.adminUsername) throw notFound('Not found');
    if (me.username.toLowerCase() !== config.adminUsername.toLowerCase()) throw forbidden('Not allowed');
    const q = z.object({ before: z.coerce.number().int().positive().optional(), cursor }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const before = c?.t ?? q.before ?? Number.MAX_SAFE_INTEGER;
    const rows = (await db
      .prepare('SELECT * FROM reports WHERE created_at < ? ORDER BY created_at DESC LIMIT 51')
      .all(before)) as {
      id: string;
      reporter_id: string;
      target_type: 'post' | 'user' | 'message';
      target_id: string;
      reason: string;
      details: string;
      created_at: number;
    }[];
    const hasMore = rows.length > 50;
    const page = rows.slice(0, 50);

    const items = await Promise.all(
      page.map(async (r) => {
        let snippet: string | null = null;
        if (r.target_type === 'post') {
          const p = (await db.prepare('SELECT content FROM posts WHERE id = ?').get(r.target_id)) as { content: string } | undefined;
          snippet = p ? p.content.slice(0, 140) : null;
        } else if (r.target_type === 'user') {
          const u = (await db.prepare('SELECT username FROM users WHERE id = ?').get(r.target_id)) as { username: string } | undefined;
          snippet = u ? `@${u.username}` : null;
        } else {
          const m = (await db.prepare('SELECT body FROM messages WHERE id = ?').get(r.target_id)) as { body: string } | undefined;
          snippet = m ? m.body.slice(0, 140) : null;
        }
        const reporter = (await db.prepare('SELECT username FROM users WHERE id = ?').get(r.reporter_id)) as { username: string } | undefined;
        return {
          id: r.id,
          reporter: reporter?.username ?? null,
          targetType: r.target_type,
          targetId: r.target_id,
          reason: r.reason,
          details: r.details,
          createdAt: r.created_at,
          snippet,
        };
      }),
    );
    return { items, nextCursor: hasMore ? encodeCursor({ t: page[page.length - 1]!.created_at }) : null };
  });
};

export default routes;
