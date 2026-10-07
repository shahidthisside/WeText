import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { ALL_INTERESTS, TRAIT_KEYS } from '../lib/catalog.js';
import { conflict, notFound } from '../lib/errors.js';
import { cursor, decodeCursor, displayName, encodeCursor, uploadUrl, username } from '../lib/validation.js';
import { notify } from '../services/notifications.js';
import { unreadNotificationCount } from '../services/notifications.js';
import { hydrateFeed } from '../services/posts.js';
import { me, userSummary } from '../services/users.js';
import { unreadMessageCounts } from './messages.js';
import type { UserRow } from '../types.js';

const website = z
  .string()
  .trim()
  .max(100)
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
  .refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Enter a valid URL');

const profileSchema = z
  .object({
    displayName,
    bio: z.string().trim().max(160, 'Bio can be at most 160 characters'),
    location: z.string().trim().max(30),
    website,
    avatarUrl: uploadUrl.nullable(),
    bannerUrl: uploadUrl.nullable(),
    interests: z.array(z.enum(ALL_INTERESTS as [string, ...string[]])).max(15, 'Pick up to 15 interests'),
    traits: z.partialRecord(z.enum(TRAIT_KEYS), z.number().int().min(0).max(100)),
    isPrivate: z.boolean(),
    dmPolicy: z.enum(['everyone', 'following', 'nobody']),
    showOnline: z.boolean(),
    onboarded: z.boolean(),
  })
  .partial();

const columns: Record<string, string> = {
  displayName: 'display_name',
  bio: 'bio',
  location: 'location',
  website: 'website',
  avatarUrl: 'avatar_url',
  bannerUrl: 'banner_url',
  interests: 'interests',
  traits: 'traits',
  isPrivate: 'is_private',
  dmPolicy: 'dm_policy',
  showOnline: 'show_online',
  onboarded: 'onboarded',
};

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;
  const reload = async (id: string) => (await db.prepare('SELECT * FROM users WHERE id = ?').get(id)) as UserRow;

  app.patch('/', async (req) => {
    const user = requireUser(req);
    const body = profileSchema.parse(req.body);
    for (const url of [body.avatarUrl, body.bannerUrl]) {
      if (url && !url.startsWith(`/uploads/${user.id}/`)) throw conflict('Invalid upload');
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, val] of Object.entries(body)) {
      if (val === undefined) continue;
      sets.push(`${columns[k]} = ?`);
      vals.push(typeof val === 'boolean' ? (val ? 1 : 0) : typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    }
    if (sets.length) await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, user.id);

    // Going public auto-approves pending follow requests.
    if (body.isPrivate === false && user.is_private) {
      const pending = (await db.prepare("SELECT follower_id FROM follows WHERE followee_id = ? AND status = 'pending'").pluck().all(user.id)) as string[];
      await db.prepare("UPDATE follows SET status = 'active' WHERE followee_id = ? AND status = 'pending'").run(user.id);
      await db.prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'follow_request'").run(user.id);
      for (const f of pending) await notify(ctx, { userId: f, actorId: user.id, type: 'follow_accept' });
    }
    return { user: (await me(ctx, await reload(user.id))) };
  });

  app.post('/username', async (req) => {
    const user = requireUser(req);
    const body = z.object({ username }).parse(req.body);
    const taken = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(body.username, user.id);
    if (taken) throw conflict('That username is taken', 'username_taken');
    await db.prepare('UPDATE users SET username = ? WHERE id = ?').run(body.username, user.id);
    return { user: (await me(ctx, await reload(user.id))) };
  });

  app.get('/counts', async (req) => {
    const user = requireUser(req);
    const msgs = await unreadMessageCounts(ctx, user.id);
    const followRequests = (
      (await db.prepare("SELECT COUNT(*) AS n FROM follows WHERE followee_id = ? AND status = 'pending'").get(user.id)) as { n: number }
    ).n;
    return { notifications: await unreadNotificationCount(ctx, user.id), messages: msgs.conversations, messageRequests: msgs.requests, followRequests };
  });

  app.get('/follow-requests', async (req) => {
    const user = requireUser(req);
    const rows = (await db
      .prepare(
        `SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id
          WHERE f.followee_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`,
      )
      .all(user.id)) as UserRow[];
    return { users: rows.map((u) => ({ ...userSummary(u), bio: u.bio })) };
  });

  app.post('/follow-requests/:userId/:action', async (req) => {
    const user = requireUser(req);
    const p = z.object({ userId: z.string().max(32), action: z.enum(['accept', 'decline']) }).parse(req.params);
    const exists = await db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'pending'").get(p.userId, user.id);
    if (!exists) throw notFound('Request not found');
    if (p.action === 'accept') {
      await db.prepare("UPDATE follows SET status = 'active' WHERE follower_id = ? AND followee_id = ?").run(p.userId, user.id);
      await notify(ctx, { userId: p.userId, actorId: user.id, type: 'follow_accept' });
    } else {
      await db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(p.userId, user.id);
    }
    await db.prepare("DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'follow_request'").run(user.id, p.userId);
    return { ok: true };
  });

  app.get('/blocks', async (req) => {
    const user = requireUser(req);
    const rows = (await db
      .prepare('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC')
      .all(user.id)) as UserRow[];
    return { users: rows.map(userSummary) };
  });

  app.get('/mutes', async (req) => {
    const user = requireUser(req);
    const rows = (await db
      .prepare('SELECT u.* FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.muter_id = ? ORDER BY m.created_at DESC')
      .all(user.id)) as UserRow[];
    return { users: rows.map(userSummary) };
  });

  app.get('/bookmarks', async (req) => {
    const user = requireUser(req);
    const q = z.object({ cursor }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const rows = (await db
      .prepare(
        `SELECT post_id, NULL AS reposted_by, created_at AS sort_at FROM bookmarks
          WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 21`,
      )
      .all(user.id, c?.t ?? Number.MAX_SAFE_INTEGER)) as { post_id: string; reposted_by: null; sort_at: number }[];
    const page = rows.slice(0, 20);
    return {
      items: await hydrateFeed(ctx, user.id, page),
      nextCursor: rows.length > 20 ? encodeCursor({ t: page[page.length - 1]!.sort_at }) : null,
    };
  });

  app.delete('/bookmarks', async (req) => {
    const user = requireUser(req);
    await db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(user.id);
    return { ok: true };
  });
};

export default routes;
