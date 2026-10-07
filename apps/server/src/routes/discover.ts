import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { INTEREST_GROUPS, MOODS, TRAITS } from '../lib/catalog.js';
import { notFound } from '../lib/errors.js';
import { cursor, decodeCursor, encodeCursor } from '../lib/validation.js';
import { followStatus, hiddenAuthorIds } from '../services/graph.js';
import { suggestMatches } from '../services/matching.js';
import { hydrateFeed, hydratePosts } from '../services/posts.js';
import { presenceOf, userSummary } from '../services/users.js';
import type { UserRow } from '../types.js';

/** Turn free text into a safe FTS5 prefix query: every token quoted, AND-ed. */
function ftsQuery(q: string): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  app.get('/meta', async () => ({ interests: INTEREST_GROUPS, traits: TRAITS, moods: MOODS }));

  app.get('/search', async (req) => {
    const q = z
      .object({ q: z.string().trim().max(100), type: z.enum(['top', 'latest', 'people', 'media']).default('top'), cursor })
      .parse(req.query);
    const viewerId = req.user?.id ?? null;
    const term = q.q.trim();
    if (!term) return { users: [], items: [], nextCursor: null };

    // People
    const like = `%${term.replace(/^@/, '').replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const hidden = await hiddenAuthorIds(db, viewerId);
    const users =
      q.type === 'top' || q.type === 'people'
        ? (
            (await db
              .prepare(
                `SELECT u.*, (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id AND f.status = 'active') AS followers
                   FROM users u
                  WHERE u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\'
                  ORDER BY (lower(u.username) = lower(?)) DESC, followers DESC LIMIT ?`,
              )
              .all(like, like, term.replace(/^@/, ''), q.type === 'people' ? 40 : 3)) as (UserRow & { followers: number })[]
          )
            .filter((u) => !hidden.has(u.id) || u.id === viewerId)
        : [];
    const userCards = await Promise.all(
      users.map(async (u) => ({
        ...userSummary(u),
        bio: u.bio,
        ...presenceOf(ctx, u),
        viewer: viewerId && viewerId !== u.id ? { following: await followStatus(db, viewerId, u.id), followedBy: (await followStatus(db, u.id, viewerId)) === 'active' } : null,
      })),
    );
    if (q.type === 'people') return { users: userCards, items: [], nextCursor: null };

    // Posts: hashtag search uses the tag index; everything else uses FTS.
    const c = decodeCursor(q.cursor, z.object({ o: z.number().int().min(0) }));
    const offset = c?.o ?? 0;
    const limit = 20;
    let ids: string[] = [];
    const tagMatch = /^#([\p{L}\p{N}_]+)$/u.exec(term);
    const mediaOnly = q.type === 'media' ? 'AND EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)' : '';
    const order =
      q.type === 'latest'
        ? 'p.created_at DESC'
        : `((SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) + 2 * (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) + 1.0) / ((? - p.created_at) / 3600000.0 + 24) DESC`;
    const orderArgs = q.type === 'latest' ? [] : [Date.now()];
    if (tagMatch) {
      ids = (await db
        .prepare(
          `SELECT p.id FROM post_tags t JOIN posts p ON p.id = t.post_id
            WHERE t.tag = ? ${mediaOnly} ORDER BY ${order} LIMIT ? OFFSET ?`,
        )
        .pluck()
        .all(tagMatch[1]!.toLowerCase(), ...orderArgs, limit + 1, offset)) as string[];
    } else {
      const fts = ftsQuery(term);
      if (fts) {
        ids = (await db
          .prepare(
            `SELECT p.id FROM posts_fts JOIN posts p ON p.rowid = posts_fts.rowid
              WHERE posts_fts MATCH ? ${mediaOnly} ORDER BY ${order} LIMIT ? OFFSET ?`,
          )
          .pluck()
          .all(fts, ...orderArgs, limit + 1, offset)) as string[];
      }
    }
    const hasMore = ids.length > limit;
    const items = (await hydrateFeed(ctx, viewerId, ids.slice(0, limit).map((id) => ({ post_id: id, reposted_by: null })))).filter(
      (i) => !i.post.author || !hidden.has(i.post.author.id),
    );
    return { users: userCards, items, nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null };
  });

  /** Trending tags: distinct authors weigh more than raw post count, last 48h with fallback to 30 days. */
  app.get('/trending', async () => {
    const rank = async (since: number) =>
      (await db
        .prepare(
          `SELECT t.tag, COUNT(*) AS posts, COUNT(DISTINCT p.author_id) AS authors
             FROM post_tags t JOIN posts p ON p.id = t.post_id
            WHERE t.created_at > ?
            GROUP BY t.tag
            ORDER BY (authors * 2 + posts) DESC, MAX(t.created_at) DESC
            LIMIT 10`,
        )
        .all(since)) as { tag: string; posts: number; authors: number }[];
    let tags = await rank(Date.now() - 48 * 3600_000);
    if (tags.length < 5) tags = await rank(Date.now() - 30 * 24 * 3600_000);
    return { tags: tags.map((t) => ({ tag: t.tag, posts: t.posts })) };
  });

  app.get('/tags/:tag', async (req) => {
    const { tag } = z.object({ tag: z.string().max(50) }).parse(req.params);
    const q = z.object({ cursor }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const rows = (await db
      .prepare(
        `SELECT p.id AS post_id, NULL AS reposted_by, p.created_at AS sort_at
           FROM post_tags t JOIN posts p ON p.id = t.post_id
          WHERE t.tag = ? AND p.created_at < ? ORDER BY p.created_at DESC LIMIT 21`,
      )
      .all(tag.toLowerCase(), c?.t ?? Number.MAX_SAFE_INTEGER)) as { post_id: string; reposted_by: null; sort_at: number }[];
    const page = rows.slice(0, 20);
    const total = ((await db.prepare('SELECT COUNT(*) AS n FROM post_tags WHERE tag = ?').get(tag.toLowerCase())) as { n: number }).n;
    return {
      tag: tag.toLowerCase(),
      total,
      items: await hydrateFeed(ctx, req.user?.id ?? null, page),
      nextCursor: rows.length > 20 ? encodeCursor({ t: page[page.length - 1]!.sort_at }) : null,
    };
  });

  // ---- Connect (interest + personality matching) ---------------------------

  app.get('/connect', async (req) => {
    const user = requireUser(req);
    const hidden = ((await db.prepare('SELECT COUNT(*) AS n FROM match_passes WHERE user_id = ?').get(user.id)) as { n: number }).n;
    return { matches: await suggestMatches(ctx, user, { limit: 30, excludeFollowing: true, excludePassed: true }), hidden };
  });

  app.post('/connect/:userId/pass', async (req) => {
    const user = requireUser(req);
    const { userId } = z.object({ userId: z.string().max(32) }).parse(req.params);
    if (!await db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw notFound();
    await db.prepare('INSERT OR IGNORE INTO match_passes (user_id, target_id, created_at) VALUES (?, ?, ?)').run(user.id, userId, Date.now());
    return { ok: true };
  });

  app.delete('/connect/passes', async (req) => {
    const user = requireUser(req);
    await db.prepare('DELETE FROM match_passes WHERE user_id = ?').run(user.id);
    return { ok: true };
  });

  /** Sidebar "Who to follow". */
  app.get('/suggestions', async (req) => {
    if (!req.user) {
      const rows = (await db
        .prepare(
          `SELECT u.* FROM users u ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC LIMIT 3`,
        )
        .all()) as UserRow[];
      return { users: rows.map((u) => ({ ...userSummary(u), bio: u.bio, reason: null })) };
    }
    const matches = await suggestMatches(ctx, req.user, { limit: 3, excludeFollowing: true, excludePassed: false });
    return {
      users: matches.map((m) => ({
        ...m.user,
        reason: m.mutualCount ? `${m.mutualCount} mutual` : m.sharedInterests.length ? `Into ${m.sharedInterests.slice(0, 2).join(', ')}` : null,
      })),
    };
  });

  /** Lightweight mention autocomplete. */
  app.get('/mentions', async (req) => {
    const q = z.object({ q: z.string().trim().max(20) }).parse(req.query);
    if (!q.q) return { users: [] };
    const viewerId = req.user?.id ?? '';
    const like = `${q.q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const rows = (await db
      .prepare(
        `SELECT u.* FROM users u
          WHERE (u.username LIKE ?1 ESCAPE '\\' OR u.display_name LIKE ?1 ESCAPE '\\')
          ORDER BY (u.id IN (SELECT followee_id FROM follows WHERE follower_id = ?2)) DESC, u.username LIMIT 6`,
      )
      .all({ 1: like, 2: viewerId })) as UserRow[];
    return { users: rows.map(userSummary) };
  });

  /** Posts for a list of ids (used to refresh cached posts). */
  app.post('/posts/batch', async (req) => {
    const { ids } = z.object({ ids: z.array(z.string().max(32)).max(50) }).parse(req.body);
    return { items: (await hydratePosts(ctx, req.user?.id ?? null, ids)) };
  });
};

export default routes;
