import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { newId } from '../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { extractMentions, extractTags, normalizeText, codePointLength } from '../lib/text.js';
import { cursor, decodeCursor, encodeCursor, uploadUrl } from '../lib/validation.js';
import { MOOD_KEYS, promptForDate } from '../lib/catalog.js';
import { canViewAuthor, isBlockedEither, blockedEitherIds } from '../services/graph.js';
import { notify, unnotify } from '../services/notifications.js';
import { hydratePosts } from '../services/posts.js';
import { userSummary } from '../services/users.js';
import type { PostRow, UserRow } from '../types.js';

const MAX_LEN = 500;
const EDIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const createSchema = z
  .object({
    content: z.string().max(MAX_LEN * 2).default(''),
    isAnonymous: z.boolean().default(false),
    mood: z.enum(MOOD_KEYS).nullish(),
    /** Fading post: disappears 24 hours after posting. */
    fade: z.boolean().default(false),
    /** Answering the daily prompt. Must be today's (or yesterday's, for timezone slack). */
    promptKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    replyToId: z.string().max(32).nullish(),
    quoteOfId: z.string().max(32).nullish(),
    media: z
      .array(z.object({ url: uploadUrl, width: z.number().int().positive(), height: z.number().int().positive(), alt: z.string().trim().max(300).default('') }))
      .max(4)
      .default([]),
    poll: z
      .object({
        options: z.array(z.string().trim().min(1, 'Poll options cannot be empty').max(40)).min(2).max(4),
        durationHours: z.number().int().min(1).max(24 * 7).default(24),
      })
      .nullish(),
  })
  .transform((b) => ({ ...b, content: normalizeText(b.content) }));

const idParam = z.object({ id: z.string().max(32) });

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;

  /** Load a post and assert the viewer can see it. */
  async function getVisiblePost(id: string, viewerId: string | null): Promise<PostRow & { author: UserRow }> {
    const post = (await db.prepare('SELECT * FROM posts WHERE id = ?').get(id)) as PostRow | undefined;
    if (!post) throw notFound('This post doesn’t exist');
    const author = (await db.prepare('SELECT * FROM users WHERE id = ?').get(post.author_id)) as UserRow;
    const ok = post.is_anonymous ? !(viewerId && viewerId !== author.id && await isBlockedEither(db, viewerId, author.id)) : await canViewAuthor(db, viewerId, author);
    if (!ok) throw notFound('This post is unavailable');
    return { ...post, author };
  }

  app.post('/', async (req, reply) => {
    const user = requireUser(req);
    const body = createSchema.parse(req.body);
    if (codePointLength(body.content) > MAX_LEN) throw badRequest(`Posts can be at most ${MAX_LEN} characters`);
    if (!body.content && body.media.length === 0 && !body.quoteOfId) throw badRequest('Write something first');
    if (body.poll && body.media.length) throw badRequest('A post can have images or a poll, not both');
    if (body.poll && !body.content) throw badRequest('Add a question for your poll');

    let parent: (PostRow & { author: UserRow }) | null = null;
    if (body.replyToId) parent = await getVisiblePost(body.replyToId, user.id);
    let quoted: (PostRow & { author: UserRow }) | null = null;
    if (body.quoteOfId) quoted = await getVisiblePost(body.quoteOfId, user.id);
    if (quoted && quoted.author.is_private && !quoted.is_anonymous) throw forbidden('Posts from private accounts can’t be quoted');

    for (const m of body.media) {
      if (!m.url.startsWith(`/uploads/${user.id}/`)) throw forbidden('You can only attach your own uploads');
      if (!(await db.prepare('SELECT 1 FROM files WHERE path = ?').get(m.url.slice('/uploads/'.length)))) throw badRequest('Upload not found — try attaching it again');
    }

    if (body.promptKey) {
      const ok = [promptForDate().key, promptForDate(new Date(Date.now() - 86_400_000)).key];
      if (!ok.includes(body.promptKey)) throw badRequest('That prompt has closed');
      if (body.replyToId) throw badRequest('Replies can’t answer the daily prompt');
    }

    const id = newId();
    const now = Date.now();
    const tags = extractTags(body.content);
    await db.transaction(async () => {
      await db.prepare(
        `INSERT INTO posts (id, author_id, content, is_anonymous, reply_to_id, quote_of_id, created_at, mood, expires_at, prompt_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id, user.id, body.content, body.isAnonymous ? 1 : 0, parent?.id ?? null, quoted?.id ?? null, now,
        body.mood ?? null, body.fade ? now + 24 * 3600_000 : null, body.promptKey ?? null,
      );
      for (const [i, m] of body.media.entries()) {
        await db.prepare('INSERT INTO post_media (id, post_id, url, width, height, alt, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          newId(), id, m.url, m.width, m.height, m.alt, i,
        );
      }
      for (const t of tags) await db.prepare('INSERT INTO post_tags (post_id, tag, created_at) VALUES (?, ?, ?)').run(id, t, now);
      if (body.poll) {
        await db.prepare('INSERT INTO polls (post_id, ends_at) VALUES (?, ?)').run(id, now + body.poll.durationHours * 3600_000);
        for (const [i, label] of body.poll.options.entries()) {
          await db.prepare('INSERT INTO poll_options (id, post_id, label, position) VALUES (?, ?, ?, ?)').run(newId(), id, label, i);
        }
      }
    });

    // Notifications (anonymous posts still notify; the actor is hidden when rendered).
    if (parent) await notify(ctx, { userId: parent.author_id, actorId: user.id, type: 'reply', postId: id });
    if (quoted) await notify(ctx, { userId: quoted.author_id, actorId: user.id, type: 'quote', postId: id });
    const mentioned = extractMentions(body.content);
    if (mentioned.length) {
      const rows = (await db
        .prepare(`SELECT * FROM users WHERE lower(username) IN (SELECT value FROM json_each(?))`)
        .all(JSON.stringify(mentioned))) as UserRow[];
      for (const u of rows) {
        if (u.id === parent?.author_id) continue; // already got a reply notification
        if (!await canViewAuthor(db, u.id, user) && !body.isAnonymous) continue;
        await notify(ctx, { userId: u.id, actorId: user.id, type: 'mention', postId: id });
      }
    }

    const [view] = await hydratePosts(ctx, user.id, [id]);
    return reply.code(201).send({ post: view });
  });

  app.get('/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const viewerId = req.user?.id ?? null;
    await getVisiblePost(id, viewerId);
    const [post] = await hydratePosts(ctx, viewerId, [id]);
    if (!post) throw notFound('This post is unavailable');

    // Walk up the reply chain (max 30) for thread context.
    const chain: string[] = [];
    let cur = ((await db.prepare('SELECT reply_to_id FROM posts WHERE id = ?').get(id)) as { reply_to_id: string | null }).reply_to_id;
    while (cur && chain.length < 30) {
      chain.unshift(cur);
      cur = ((await db.prepare('SELECT reply_to_id FROM posts WHERE id = ?').get(cur)) as { reply_to_id: string | null } | undefined)?.reply_to_id ?? null;
    }
    const ancestors = await hydratePosts(ctx, viewerId, chain);
    const missingParent = !!post.replyTo && (ancestors.length === 0 || ancestors[ancestors.length - 1]!.id !== post.replyTo.id);
    return { post, ancestors, missingParent };
  });

  app.get('/:id/replies', async (req) => {
    const { id } = idParam.parse(req.params);
    const q = z.object({ cursor }).parse(req.query);
    const viewerId = req.user?.id ?? null;
    const root = await getVisiblePost(id, viewerId);
    const c = decodeCursor(q.cursor, z.object({ o: z.number().int().min(0) }));
    const offset = c?.o ?? 0;
    const limit = 20;
    // Author's own replies first (self-threads), then by engagement, then oldest first.
    const ids = (await db
      .prepare(
        `SELECT p.id FROM posts p
         WHERE p.reply_to_id = ?
         ORDER BY (p.author_id = ? AND p.is_anonymous = ?) DESC,
                  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) + 2 * (SELECT COUNT(*) FROM posts r WHERE r.reply_to_id = p.id) DESC,
                  p.created_at ASC
         LIMIT ? OFFSET ?`,
      )
      .pluck()
      .all(id, root.author_id, root.is_anonymous, limit + 1, offset)) as string[];
    const hasMore = ids.length > limit;
    const posts = await hydratePosts(ctx, viewerId, ids.slice(0, limit));
    return { items: posts, nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null };
  });

  app.patch('/:id', async (req) => {
    const user = requireUser(req);
    const { id } = idParam.parse(req.params);
    const body = z.object({ content: z.string().max(MAX_LEN * 2) }).parse(req.body);
    const content = normalizeText(body.content);
    const post = (await db.prepare('SELECT * FROM posts WHERE id = ?').get(id)) as PostRow | undefined;
    if (!post) throw notFound();
    if (post.author_id !== user.id) throw forbidden();
    if (Date.now() - post.created_at > EDIT_WINDOW_MS) throw badRequest('Posts can only be edited within an hour of posting');
    if (codePointLength(content) > MAX_LEN) throw badRequest(`Posts can be at most ${MAX_LEN} characters`);
    const hasMedia = await db.prepare('SELECT 1 FROM post_media WHERE post_id = ?').get(id);
    if (!content && !hasMedia && !post.quote_of_id) throw badRequest('A post can’t be empty');
    // Saving without changing anything is not an edit.
    if (content === post.content) return { post: (await hydratePosts(ctx, user.id, [id]))[0] };
    const now = Date.now();
    await db.transaction(async () => {
      await db.prepare('INSERT INTO post_edits (id, post_id, content, replaced_at) VALUES (?, ?, ?, ?)').run(newId(), id, post.content, now);
      await db.prepare('UPDATE posts SET content = ?, edited_at = ? WHERE id = ?').run(content, now, id);
      await db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(id);
      for (const t of extractTags(content)) await db.prepare('INSERT INTO post_tags (post_id, tag, created_at) VALUES (?, ?, ?)').run(id, t, now);
    });
    return { post: (await hydratePosts(ctx, user.id, [id]))[0] };
  });

  /**
   * Edit history: every earlier version of the text, newest first. Visible to anyone who can see
   * the post itself (same rules as reading it). It never includes who wrote an anonymous post.
   */
  app.get('/:id/history', async (req) => {
    const { id } = idParam.parse(req.params);
    const post = await getVisiblePost(id, req.user?.id ?? null);
    if (post.expires_at && post.expires_at <= Date.now()) throw notFound();
    const edits = (await db
      .prepare('SELECT content, replaced_at FROM post_edits WHERE post_id = ? ORDER BY replaced_at ASC')
      .all(id)) as { content: string; replaced_at: number }[];
    // edits[i].content was live from the previous edit (or the post's creation) until edits[i].replaced_at.
    const versions = edits.map((e, i) => ({ content: e.content, at: i === 0 ? post.created_at : edits[i - 1]!.replaced_at, current: false }));
    versions.push({ content: post.content, at: post.edited_at ?? post.created_at, current: true });
    return {
      edited: !!post.edited_at,
      // Edits made before history was kept have no saved earlier text.
      complete: !post.edited_at || edits.length > 0,
      versions: versions.reverse(),
    };
  });

  app.delete('/:id', async (req) => {
    const user = requireUser(req);
    const { id } = idParam.parse(req.params);
    const post = (await db.prepare('SELECT author_id FROM posts WHERE id = ?').get(id)) as { author_id: string } | undefined;
    if (!post) throw notFound();
    if (post.author_id !== user.id) throw forbidden();
    // Delete the post and its whole reply subtree in one transaction, so replies don't become
    // orphaned top-level posts (reply_to_id is ON DELETE SET NULL). A recursive CTE collects every
    // descendant; quote_of_id references stay safe (SET NULL -> rendered "unavailable") and reposts,
    // likes, media, tags, polls and notifications for the deleted posts cascade away via their FKs.
    await db.transaction(async () => {
      const toDelete = (await db
        .prepare(
          `WITH RECURSIVE tree(id) AS (
             SELECT ?1
             UNION ALL
             SELECT p.id FROM posts p JOIN tree ON p.reply_to_id = tree.id
           )
           SELECT id FROM tree`,
        )
        .pluck()
        .all(id)) as string[];
      await db.prepare(`DELETE FROM posts WHERE id IN (SELECT value FROM json_each(?))`).run(JSON.stringify(toDelete));
    });
    return { ok: true };
  });

  // ---- Engagement toggles -------------------------------------------------

  const toggle = (table: 'likes' | 'reposts' | 'bookmarks', notifyType?: 'like' | 'repost') => {
    app.post(`/:id/${table === 'likes' ? 'like' : table === 'reposts' ? 'repost' : 'bookmark'}`, async (req) => {
      const user = requireUser(req);
      const { id } = idParam.parse(req.params);
      const post = await getVisiblePost(id, user.id);
      if (table === 'reposts' && post.author.is_private && !post.is_anonymous && post.author_id !== user.id) {
        throw forbidden('Posts from private accounts can’t be reposted');
      }
      const r = await db.prepare(`INSERT OR IGNORE INTO ${table} (user_id, post_id, created_at) VALUES (?, ?, ?)`).run(user.id, id, Date.now());
      if (r.changes && notifyType) await notify(ctx, { userId: post.author_id, actorId: user.id, type: notifyType, postId: id });
      return { ok: true };
    });
    app.delete(`/:id/${table === 'likes' ? 'like' : table === 'reposts' ? 'repost' : 'bookmark'}`, async (req) => {
      const user = requireUser(req);
      const { id } = idParam.parse(req.params);
      const post = (await db.prepare('SELECT author_id FROM posts WHERE id = ?').get(id)) as { author_id: string } | undefined;
      await db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND post_id = ?`).run(user.id, id);
      if (post && notifyType) await unnotify(ctx, { userId: post.author_id, actorId: user.id, type: notifyType, postId: id });
      return { ok: true };
    });
  };
  toggle('likes', 'like');
  toggle('reposts', 'repost');
  toggle('bookmarks');

  app.post('/:id/vote', async (req) => {
    const user = requireUser(req);
    const { id } = idParam.parse(req.params);
    const { optionId } = z.object({ optionId: z.string().max(32) }).parse(req.body);
    await getVisiblePost(id, user.id);
    const poll = (await db.prepare('SELECT ends_at FROM polls WHERE post_id = ?').get(id)) as { ends_at: number } | undefined;
    if (!poll) throw notFound('Poll not found');
    if (poll.ends_at <= Date.now()) throw badRequest('This poll has ended');
    if (!await db.prepare('SELECT 1 FROM poll_options WHERE id = ? AND post_id = ?').get(optionId, id)) throw badRequest('Invalid option');
    const r = await db.prepare('INSERT OR IGNORE INTO poll_votes (post_id, user_id, option_id) VALUES (?, ?, ?)').run(id, user.id, optionId);
    if (!r.changes) throw badRequest('You already voted');
    return { post: (await hydratePosts(ctx, user.id, [id]))[0] };
  });

  app.get('/:id/likes', async (req) => {
    const { id } = idParam.parse(req.params);
    const viewerId = req.user?.id ?? null;
    await getVisiblePost(id, viewerId);
    const rows = (await db
      .prepare('SELECT u.* FROM likes l JOIN users u ON u.id = l.user_id WHERE l.post_id = ? ORDER BY l.created_at DESC LIMIT 100')
      .all(id)) as UserRow[];
    // Hide people who blocked the viewer or whom the viewer blocked (either direction).
    const blocked = await blockedEitherIds(db, viewerId);
    return { users: rows.filter((u) => u.id === viewerId || !blocked.has(u.id)).map(userSummary) };
  });

  app.get('/:id/quotes', async (req) => {
    const { id } = idParam.parse(req.params);
    await getVisiblePost(id, req.user?.id ?? null);
    const ids = (await db.prepare('SELECT id FROM posts WHERE quote_of_id = ? ORDER BY created_at DESC LIMIT 50').pluck().all(id)) as string[];
    return { items: (await hydratePosts(ctx, req.user?.id ?? null, ids)) };
  });
};

export default routes;
