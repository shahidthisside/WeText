import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { badRequest, notFound } from '../lib/errors.js';
import { cursor, decodeCursor, encodeCursor } from '../lib/validation.js';
import { canViewAuthor, followStatus, isBlockedEither } from '../services/graph.js';
import { notify, unnotify } from '../services/notifications.js';
import { hydrateFeed, hydratePosts } from '../services/posts.js';
import { presenceOf, userProfile, userSummary } from '../services/users.js';
import type { UserRow } from '../types.js';
import { compatibility } from '../services/matching.js';

const PAGE = 20;
const unameParam = z.object({ username: z.string().max(30) });

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  function getUser(username: string): UserRow {
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username.replace(/^@/, '')) as UserRow | undefined;
    if (!u) throw notFound('This account doesn’t exist');
    return u;
  }

  app.get('/:username', async (req) => {
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    const viewerId = req.user?.id ?? null;
    return { user: userProfile(ctx, u, viewerId), canViewContent: canViewAuthor(db, viewerId, u) };
  });

  app.get('/:username/posts', async (req) => {
    const { username } = unameParam.parse(req.params);
    const q = z.object({ tab: z.enum(['posts', 'replies', 'media', 'likes']).default('posts'), cursor }).parse(req.query);
    const u = getUser(username);
    const viewerId = req.user?.id ?? null;
    if (!canViewAuthor(db, viewerId, u)) return { items: [], nextCursor: null };
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const before = c?.t ?? Number.MAX_SAFE_INTEGER;
    const isSelf = viewerId === u.id;

    let rows: { post_id: string; reposted_by: string | null; sort_at: number }[];
    if (q.tab === 'posts') {
      rows = db
        .prepare(
          `SELECT * FROM (
             SELECT id AS post_id, NULL AS reposted_by, created_at AS sort_at FROM posts
              WHERE author_id = ?1 AND reply_to_id IS NULL AND is_anonymous = 0
             UNION ALL
             SELECT post_id, user_id, created_at FROM reposts WHERE user_id = ?1
           ) WHERE sort_at < ?2 ORDER BY sort_at DESC LIMIT ?3`,
        )
        .all({ 1: u.id, 2: before, 3: PAGE + 1 }) as typeof rows;
    } else if (q.tab === 'replies') {
      rows = db
        .prepare(
          `SELECT id AS post_id, NULL AS reposted_by, created_at AS sort_at FROM posts
            WHERE author_id = ? AND reply_to_id IS NOT NULL AND is_anonymous = 0 AND created_at < ?
            ORDER BY created_at DESC LIMIT ?`,
        )
        .all(u.id, before, PAGE + 1) as typeof rows;
    } else if (q.tab === 'media') {
      rows = db
        .prepare(
          `SELECT p.id AS post_id, NULL AS reposted_by, p.created_at AS sort_at FROM posts p
            WHERE p.author_id = ? AND p.is_anonymous = 0 AND p.created_at < ?
              AND EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)
            ORDER BY p.created_at DESC LIMIT ?`,
        )
        .all(u.id, before, PAGE + 1) as typeof rows;
    } else {
      // Likes are private: only visible to the account owner.
      if (!isSelf) return { items: [], nextCursor: null };
      rows = db
        .prepare(
          `SELECT post_id, NULL AS reposted_by, created_at AS sort_at FROM likes
            WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(u.id, before, PAGE + 1) as typeof rows;
    }

    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    return {
      items: hydrateFeed(ctx, viewerId, page),
      nextCursor: hasMore ? encodeCursor({ t: page[page.length - 1]!.sort_at }) : null,
    };
  });

  /** How well you and this person click (interests + vibe). */
  app.get('/:username/vibe', async (req) => {
    const viewer = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    if (u.id === viewer.id || isBlockedEither(db, viewer.id, u.id)) return { vibe: null };
    const c = compatibility(viewer, u);
    return { vibe: { score: c.score, sharedInterests: c.shared, highlights: c.highlights, traits: c.vibe } };
  });

  /** Anonymous posts written by the signed-in user (only ever visible to them). */
  app.get('/me/anonymous', async (req) => {
    const user = requireUser(req);
    const ids = db
      .prepare('SELECT id FROM posts WHERE author_id = ? AND is_anonymous = 1 ORDER BY created_at DESC LIMIT 100')
      .pluck()
      .all(user.id) as string[];
    return { items: hydratePosts(ctx, user.id, ids) };
  });

  const listSchema = z.object({ cursor });
  function followList(kind: 'followers' | 'following') {
    app.get(`/:username/${kind}`, async (req) => {
      const { username } = unameParam.parse(req.params);
      const q = listSchema.parse(req.query);
      const u = getUser(username);
      const viewerId = req.user?.id ?? null;
      if (!canViewAuthor(db, viewerId, u)) return { users: [], nextCursor: null };
      const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
      const [col, other] = kind === 'followers' ? ['followee_id', 'follower_id'] : ['follower_id', 'followee_id'];
      const rows = db
        .prepare(
          `SELECT u.*, f.created_at AS f_at FROM follows f JOIN users u ON u.id = f.${other}
            WHERE f.${col} = ? AND f.status = 'active' AND f.created_at < ?
            ORDER BY f.created_at DESC LIMIT ?`,
        )
        .all(u.id, c?.t ?? Number.MAX_SAFE_INTEGER, 31) as (UserRow & { f_at: number })[];
      const page = rows.slice(0, 30);
      return {
        users: page.map((r) => userCard(r, viewerId)),
        nextCursor: rows.length > 30 ? encodeCursor({ t: page[page.length - 1]!.f_at }) : null,
      };
    });
  }
  followList('followers');
  followList('following');

  /** Compact user with bio + relationship, used in lists. */
  function userCard(u: UserRow, viewerId: string | null) {
    return {
      ...userSummary(u),
      bio: u.bio,
      ...presenceOf(ctx, u),
      viewer: viewerId && viewerId !== u.id
        ? { following: followStatus(db, viewerId, u.id), followedBy: followStatus(db, u.id, viewerId) === 'active' }
        : null,
    };
  }

  // ---- Follow / block / mute -----------------------------------------------

  app.post('/:username/follow', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    if (u.id === me.id) throw badRequest('You can’t follow yourself');
    if (isBlockedEither(db, me.id, u.id)) throw badRequest('You can’t follow this account');
    const existing = followStatus(db, me.id, u.id);
    if (existing !== 'none') return { status: existing };
    const status = u.is_private ? 'pending' : 'active';
    db.prepare('INSERT INTO follows (follower_id, followee_id, status, created_at) VALUES (?, ?, ?, ?)').run(me.id, u.id, status, Date.now());
    notify(ctx, { userId: u.id, actorId: me.id, type: status === 'pending' ? 'follow_request' : 'follow' });
    return { status };
  });

  app.delete('/:username/follow', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(me.id, u.id);
    unnotify(ctx, { userId: u.id, actorId: me.id, type: 'follow_request' });
    return { status: 'none' };
  });

  /** Remove someone from your followers. */
  app.delete('/:username/follower', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(u.id, me.id);
    return { ok: true };
  });

  app.post('/:username/block', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    if (u.id === me.id) throw badRequest('You can’t block yourself');
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(me.id, u.id, Date.now());
      db.prepare('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)').run(me.id, u.id, u.id, me.id);
      db.prepare('DELETE FROM notifications WHERE (user_id = ? AND actor_id = ?) OR (user_id = ? AND actor_id = ?)').run(me.id, u.id, u.id, me.id);
    })();
    return { ok: true };
  });

  app.delete('/:username/block', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(me.id, u.id);
    return { ok: true };
  });

  app.post('/:username/mute', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    if (u.id === me.id) throw badRequest('You can’t mute yourself');
    db.prepare('INSERT OR IGNORE INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?)').run(me.id, u.id, Date.now());
    return { ok: true };
  });

  app.delete('/:username/mute', async (req) => {
    const me = requireUser(req);
    const { username } = unameParam.parse(req.params);
    const u = getUser(username);
    db.prepare('DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?').run(me.id, u.id);
    return { ok: true };
  });
};

export default routes;
