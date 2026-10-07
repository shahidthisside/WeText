import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { cursor, decodeCursor, encodeCursor } from '../lib/validation.js';
import { unreadNotificationCount } from '../services/notifications.js';
import { hydratePosts } from '../services/posts.js';
import { userSummary, type UserSummary } from '../services/users.js';
import type { PostRow, UserRow } from '../types.js';

interface NotifRow {
  id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  created_at: number;
  read_at: number | null;
}

/** Types whose actor is hidden when the triggering post is anonymous. */
const POST_AUTHORED = new Set(['reply', 'quote', 'mention']);
/** Types collapsed into one row per post ("Ana and 3 others liked your post"). */
const GROUPABLE = new Set(['like', 'repost', 'follow']);

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  app.get('/', async (req) => {
    const user = requireUser(req);
    const q = z.object({ cursor, filter: z.enum(['all', 'mentions']).default('all') }).parse(req.query);
    const c = decodeCursor(q.cursor, z.object({ t: z.number() }));
    const typeFilter = q.filter === 'mentions' ? "AND type IN ('mention', 'reply', 'quote')" : '';
    const rows = (await db
      .prepare(
        `SELECT * FROM notifications WHERE user_id = ? AND created_at < ? ${typeFilter}
          ORDER BY created_at DESC LIMIT 61`,
      )
      .all(user.id, c?.t ?? Number.MAX_SAFE_INTEGER)) as NotifRow[];
    const hasMore = rows.length > 60;
    const page = rows.slice(0, 60);

    const actorIds = [...new Set(page.map((r) => r.actor_id))];
    const actors = new Map(
      ((await db.prepare('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(actorIds))) as UserRow[]).map(
        (u) => [u.id, u],
      ),
    );
    const postIds = [...new Set(page.map((r) => r.post_id).filter(Boolean) as string[])];
    const posts = new Map((await hydratePosts(ctx, user.id, postIds)).map((p) => [p.id, p]));
    const anonFlags = new Map(
      ((await db.prepare('SELECT id, is_anonymous FROM posts WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(postIds))) as Pick<
        PostRow,
        'id' | 'is_anonymous'
      >[]).map((p) => [p.id, !!p.is_anonymous]),
    );

    type Group = {
      id: string;
      type: string;
      createdAt: number;
      read: boolean;
      actors: (UserSummary | null)[];
      actorCount: number;
      post: Awaited<ReturnType<typeof hydratePosts>>[number] | null;
    };
    const groups: Group[] = [];
    const byKey = new Map<string, Group>();
    for (const r of page) {
      const actor = actors.get(r.actor_id);
      if (!actor) continue;
      const post = r.post_id ? posts.get(r.post_id) : null;
      if (r.post_id && !post) continue; // post deleted or no longer visible
      const anonymous = POST_AUTHORED.has(r.type) && r.post_id ? anonFlags.get(r.post_id) : false;
      const actorView = anonymous ? null : userSummary(actor);
      // Group within the same calendar day to keep the list readable.
      const key = GROUPABLE.has(r.type) ? `${r.type}:${r.post_id ?? ''}:${new Date(r.created_at).toDateString()}` : r.id;
      const existing = byKey.get(key);
      if (existing) {
        existing.actorCount++;
        if (existing.actors.length < 5) existing.actors.push(actorView);
        if (!r.read_at) existing.read = false;
        continue;
      }
      const g: Group = { id: r.id, type: r.type, createdAt: r.created_at, read: !!r.read_at, actors: [actorView], actorCount: 1, post: post ?? null };
      byKey.set(key, g);
      groups.push(g);
    }

    return { items: groups, nextCursor: hasMore ? encodeCursor({ t: page[page.length - 1]!.created_at }) : null };
  });

  app.post('/read', async (req) => {
    const user = requireUser(req);
    await db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(Date.now(), user.id);
    ctx.rt.emitToUser(user.id, 'notification', { unread: 0 });
    return { ok: true, unread: (await unreadNotificationCount(ctx, user.id)) };
  });
};

export default routes;
