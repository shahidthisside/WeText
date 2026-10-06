import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { cursor, decodeCursor, encodeCursor } from '../lib/validation.js';
import { hiddenAuthorIds } from '../services/graph.js';
import { hydrateFeed } from '../services/posts.js';
import { parseJson } from '../services/users.js';
import { MOOD_KEYS, promptForDate } from '../lib/catalog.js';

const PAGE = 20;
const moodQ = z.enum(MOOD_KEYS).optional();

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  /**
   * Following: chronological posts + reposts from people you follow (and you).
   * Anonymous posts are excluded here, since showing them would reveal who wrote them.
   */
  app.get('/following', async (req) => {
    const user = requireUser(req);
    const q = z.object({ cursor, mood: moodQ }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const before = c?.t ?? Number.MAX_SAFE_INTEGER;
    const rows = db
      .prepare(
        `WITH f AS (SELECT followee_id AS id FROM follows WHERE follower_id = ?1 AND status = 'active'),
              hidden AS (SELECT muted_id AS id FROM mutes WHERE muter_id = ?1)
         SELECT post_id, reposted_by, sort_at FROM (
           SELECT p.id AS post_id, NULL AS reposted_by, p.created_at AS sort_at
             FROM posts p
            WHERE p.reply_to_id IS NULL
              AND ((p.author_id IN (SELECT id FROM f) AND p.is_anonymous = 0) OR p.author_id = ?1)
           UNION ALL
           SELECT r.post_id, r.user_id, r.created_at
             FROM reposts r
            WHERE r.user_id IN (SELECT id FROM f) OR r.user_id = ?1
         )
         WHERE sort_at < ?2
           AND (?4 IS NULL OR post_id IN (SELECT id FROM posts WHERE mood = ?4))
           AND post_id NOT IN (SELECT id FROM posts WHERE author_id IN (SELECT id FROM hidden) AND is_anonymous = 0)
         ORDER BY sort_at DESC
         LIMIT ?3`,
      )
      .all({ 1: user.id, 2: before, 3: PAGE + 1, 4: q.mood ?? null }) as { post_id: string; reposted_by: string | null; sort_at: number }[];
    const hasMore = rows.length > PAGE;
    const page = rows.slice(0, PAGE);
    return {
      items: hydrateFeed(ctx, user.id, page),
      nextCursor: hasMore ? encodeCursor({ t: page[page.length - 1]!.sort_at }) : null,
    };
  });

  /**
   * For you: ranked recent top-level posts. Score blends engagement with a
   * time decay (HN-style), boosted by tags matching your interests and by
   * authors you follow. Candidates are the latest 600 posts.
   */
  app.get('/foryou', async (req) => {
    const viewerId = req.user?.id ?? null;
    const q = z.object({ cursor, mood: moodQ }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ o: z.number().int().min(0), at: z.number() }));
    const offset = c?.o ?? 0;
    // Pin the candidate window to the first page's timestamp so pages stay stable.
    const asOf = c?.at ?? Date.now();

    const hidden = hiddenAuthorIds(db, viewerId);
    const interests = new Set(
      req.user ? parseJson<string[]>(req.user.interests, []).map((i) => i.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')) : [],
    );
    const followees = viewerId
      ? new Set(db.prepare("SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'active'").pluck().all(viewerId) as string[])
      : new Set<string>();

    const candidates = db
      .prepare(
        `SELECT p.id, p.author_id, p.is_anonymous, p.created_at,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes,
           (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) AS reposts,
           (SELECT COUNT(*) FROM posts c WHERE c.reply_to_id = p.id) AS replies,
           (SELECT group_concat(tag, ' ') FROM post_tags WHERE post_id = p.id) AS tags,
           u.is_private
         FROM posts p JOIN users u ON u.id = p.author_id
         WHERE p.reply_to_id IS NULL AND p.created_at <= ? AND (? IS NULL OR p.mood = ?)
         ORDER BY p.created_at DESC LIMIT 600`,
      )
      .all(asOf, q.mood ?? null, q.mood ?? null) as {
      id: string;
      author_id: string;
      is_anonymous: number;
      created_at: number;
      likes: number;
      reposts: number;
      replies: number;
      tags: string | null;
      is_private: number;
    }[];

    const scored = candidates
      .filter((p) => {
        if (p.author_id === viewerId) return true;
        if (hidden.has(p.author_id)) return false;
        if (p.is_private && !p.is_anonymous && !followees.has(p.author_id)) return false;
        return true;
      })
      .map((p) => {
        const hours = Math.max(0, (asOf - p.created_at) / 3600_000);
        const engagement = 1 + p.likes + 2 * p.reposts + 1.5 * p.replies;
        let score = engagement / Math.pow(hours + 2, 1.4);
        const tagHits = (p.tags ?? '').split(' ').filter((t) => t && interests.has(t)).length;
        if (tagHits) score *= 1 + 0.6 * tagHits;
        if (!p.is_anonymous && followees.has(p.author_id)) score *= 1.5;
        if (p.author_id === viewerId) score *= 0.8;
        return { id: p.id, score };
      })
      .sort((a, b) => b.score - a.score);

    const page = scored.slice(offset, offset + PAGE);
    const hasMore = scored.length > offset + PAGE;
    return {
      items: hydrateFeed(ctx, viewerId, page.map((p) => ({ post_id: p.id, reposted_by: null }))),
      nextCursor: hasMore ? encodeCursor({ o: offset + PAGE, at: asOf }) : null,
    };
  });

  /** Whispers: anonymous top-level posts, newest first. Never reveals authors. */
  app.get('/whispers', async (req) => {
    const viewerId = req.user?.id ?? null;
    const q = z.object({ cursor, mood: moodQ }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const rows = db
      .prepare(
        `SELECT id AS post_id, NULL AS reposted_by, created_at AS sort_at FROM posts
          WHERE is_anonymous = 1 AND reply_to_id IS NULL AND created_at < ? AND (? IS NULL OR mood = ?)
          ORDER BY created_at DESC LIMIT ?`,
      )
      .all(c?.t ?? Number.MAX_SAFE_INTEGER, q.mood ?? null, q.mood ?? null, PAGE + 1) as { post_id: string; reposted_by: null; sort_at: number }[];
    const page = rows.slice(0, PAGE);
    return {
      items: hydrateFeed(ctx, viewerId, page),
      nextCursor: rows.length > PAGE ? encodeCursor({ t: page[page.length - 1]!.sort_at }) : null,
    };
  });

  /** Today's prompt + answers. */
  app.get('/prompt', async (req) => {
    const viewerId = req.user?.id ?? null;
    const p = promptForDate();
    const q = z.object({ cursor }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const rows = db
      .prepare(
        `SELECT id AS post_id, NULL AS reposted_by, created_at AS sort_at FROM posts
          WHERE prompt_key = ? AND reply_to_id IS NULL AND created_at < ?
          ORDER BY created_at DESC LIMIT ?`,
      )
      .all(p.key, c?.t ?? Number.MAX_SAFE_INTEGER, PAGE + 1) as { post_id: string; reposted_by: null; sort_at: number }[];
    const page = rows.slice(0, PAGE);
    const stats = db
      .prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT author_id) AS people FROM posts WHERE prompt_key = ? AND reply_to_id IS NULL')
      .get(p.key) as { n: number; people: number };
    const answered = viewerId ? !!db.prepare('SELECT 1 FROM posts WHERE prompt_key = ? AND author_id = ? LIMIT 1').get(p.key, viewerId) : false;
    return {
      prompt: { ...p, answers: stats.n, people: stats.people, answered },
      items: hydrateFeed(ctx, viewerId, page),
      nextCursor: rows.length > PAGE ? encodeCursor({ t: page[page.length - 1]!.sort_at }) : null,
    };
  });

  /** Mood pulse: what the community has been feeling in the last 24h. */
  app.get('/pulse', async () => {
    const rows = db
      .prepare('SELECT mood, COUNT(*) AS n FROM posts WHERE mood IS NOT NULL AND created_at > ? GROUP BY mood ORDER BY n DESC')
      .all(Date.now() - 24 * 3600_000) as { mood: string; n: number }[];
    const total = rows.reduce((s, r) => s + r.n, 0);
    return { total, moods: rows.map((r) => ({ mood: r.mood, count: r.n })) };
  });
};

export default routes;
