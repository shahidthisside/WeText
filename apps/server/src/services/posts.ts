import type { Ctx, PostRow, UserRow } from '../types.js';
import { activeFolloweeIds, blockedEitherIds } from './graph.js';
import { userSummary, type UserSummary } from './users.js';

export interface PostMedia {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface PollView {
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  endsAt: number;
  closed: boolean;
  myVote: string | null;
}

export interface PostView {
  id: string;
  content: string;
  createdAt: number;
  editedAt: number | null;
  isAnonymous: boolean;
  mood: string | null;
  expiresAt: number | null;
  promptKey: string | null;
  isMine: boolean;
  author: UserSummary | null;
  replyTo: { id: string; username: string | null } | null;
  quote: PostView | { id: string; unavailable: true } | null;
  media: PostMedia[];
  poll: PollView | null;
  tags: string[];
  counts: { likes: number; reposts: number; replies: number; quotes: number };
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean };
}

/** Embedded via json_each so arbitrarily long id lists stay a single bound parameter. */
const IN_IDS = '(SELECT value FROM json_each(?))';

interface Env {
  viewerId: string | null;
  blocked: Set<string>;
  followees: Set<string>;
}

async function makeEnv(ctx: Ctx, viewerId: string | null): Promise<Env> {
  const [blocked, followees] = await Promise.all([
    blockedEitherIds(ctx.db, viewerId),
    viewerId ? activeFolloweeIds(ctx.db, viewerId) : Promise.resolve(new Set<string>()),
  ]);
  return { viewerId, blocked, followees };
}

function visible(env: Env, post: PostRow, author: UserRow | undefined): boolean {
  if (!author) return false;
  if (post.author_id === env.viewerId) return true;
  if (env.blocked.has(post.author_id)) return false;
  // Anonymous posts are public by design (identity is never revealed).
  if (author.is_private && !post.is_anonymous && !env.followees.has(author.id)) return false;
  return true;
}

/**
 * Load posts by id and turn them into API views, preserving the input order
 * and silently dropping anything the viewer isn't allowed to see.
 */
export async function hydratePosts(ctx: Ctx, viewerId: string | null, ids: string[], depth = 0, envIn?: Env): Promise<PostView[]> {
  if (ids.length === 0) return [];
  const { db } = ctx;
  const env = envIn ?? (await makeEnv(ctx, viewerId));
  const json = JSON.stringify([...new Set(ids)]);

  const posts = (await db
    .prepare(`SELECT * FROM posts WHERE id IN ${IN_IDS} AND (expires_at IS NULL OR expires_at > ?)`)
    .all(json, Date.now())) as PostRow[];
  if (posts.length === 0) return [];

  const parentIds = posts.map((p) => p.reply_to_id).filter(Boolean) as string[];
  const authorIds = new Set(posts.map((p) => p.author_id));
  const parents = parentIds.length
    ? ((await db.prepare(`SELECT id, author_id, is_anonymous FROM posts WHERE id IN ${IN_IDS}`).all(JSON.stringify(parentIds))) as Pick<
        PostRow,
        'id' | 'author_id' | 'is_anonymous'
      >[])
    : [];
  parents.forEach((p) => authorIds.add(p.author_id));

  const authors = new Map(
    ((await db.prepare(`SELECT * FROM users WHERE id IN ${IN_IDS}`).all(JSON.stringify([...authorIds]))) as UserRow[]).map((u) => [u.id, u]),
  );
  const parentMap = new Map(parents.map((p) => [p.id, p]));

  const visiblePosts = posts.filter((p) => visible(env, p, authors.get(p.author_id)));
  if (visiblePosts.length === 0) return [];
  const vjson = JSON.stringify(visiblePosts.map((p) => p.id));

  const viewerFlags = async (table: string) =>
    viewerId
      ? new Set((await db.prepare(`SELECT post_id FROM ${table} WHERE user_id = ? AND post_id IN ${IN_IDS}`).pluck().all(viewerId, vjson)) as string[])
      : new Set<string>();

  const [countRows, liked, reposted, bookmarked, mediaRows, tagRows, polls] = await Promise.all([
    db
      .prepare(
        `SELECT p.id,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes,
            (SELECT COUNT(*) FROM reposts WHERE post_id = p.id) AS reposts,
            (SELECT COUNT(*) FROM posts c WHERE c.reply_to_id = p.id) AS replies,
            (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id = p.id) AS quotes
           FROM posts p WHERE p.id IN ${IN_IDS}`,
      )
      .all(vjson) as Promise<{ id: string; likes: number; reposts: number; replies: number; quotes: number }[]>,
    viewerFlags('likes'),
    viewerFlags('reposts'),
    viewerFlags('bookmarks'),
    db.prepare(`SELECT * FROM post_media WHERE post_id IN ${IN_IDS} ORDER BY position`).all(vjson) as Promise<(PostMedia & { post_id: string })[]>,
    db.prepare(`SELECT post_id, tag FROM post_tags WHERE post_id IN ${IN_IDS}`).all(vjson) as Promise<{ post_id: string; tag: string }[]>,
    loadPolls(ctx, viewerId, vjson),
  ]);

  const counts = new Map(countRows.map((r) => [r.id, r]));

  const media = new Map<string, PostMedia[]>();
  for (const m of mediaRows) {
    const list = media.get(m.post_id) ?? [];
    list.push({ url: m.url, width: m.width, height: m.height, alt: m.alt });
    media.set(m.post_id, list);
  }

  const tags = new Map<string, string[]>();
  for (const t of tagRows) {
    tags.set(t.post_id, [...(tags.get(t.post_id) ?? []), t.tag]);
  }

  // Quotes: hydrate one level deep only.
  const quoteIds = visiblePosts.map((p) => p.quote_of_id).filter(Boolean) as string[];
  const quotes =
    depth === 0 && quoteIds.length
      ? new Map((await hydratePosts(ctx, viewerId, quoteIds, depth + 1, env)).map((q) => [q.id, q]))
      : new Map<string, PostView>();

  const byId = new Map<string, PostView>();
  for (const p of visiblePosts) {
    const author = authors.get(p.author_id)!;
    const isMine = p.author_id === viewerId;
    const parent = p.reply_to_id ? parentMap.get(p.reply_to_id) : undefined;
    const parentAuthor = parent ? authors.get(parent.author_id) : undefined;
    const c = counts.get(p.id)!;
    byId.set(p.id, {
      id: p.id,
      content: p.content,
      createdAt: p.created_at,
      editedAt: p.edited_at,
      isAnonymous: !!p.is_anonymous,
      mood: p.mood,
      expiresAt: p.expires_at,
      promptKey: p.prompt_key,
      isMine,
      author: p.is_anonymous && !isMine ? null : userSummary(author),
      replyTo: p.reply_to_id
        ? {
            id: p.reply_to_id,
            username: parent && parentAuthor && !parent.is_anonymous ? parentAuthor.username : null,
          }
        : null,
      quote: p.quote_of_id
        ? depth > 0
          ? null
          : (quotes.get(p.quote_of_id) ?? { id: p.quote_of_id, unavailable: true })
        : null,
      media: media.get(p.id) ?? [],
      poll: polls.get(p.id) ?? null,
      tags: tags.get(p.id) ?? [],
      counts: { likes: c.likes, reposts: c.reposts, replies: c.replies, quotes: c.quotes },
      viewer: { liked: liked.has(p.id), reposted: reposted.has(p.id), bookmarked: bookmarked.has(p.id) },
    });
  }

  return ids.map((id) => byId.get(id)).filter((p): p is PostView => !!p);
}

async function loadPolls(ctx: Ctx, viewerId: string | null, vjson: string): Promise<Map<string, PollView>> {
  const { db } = ctx;
  const polls = (await db.prepare(`SELECT * FROM polls WHERE post_id IN ${IN_IDS}`).all(vjson)) as { post_id: string; ends_at: number }[];
  const out = new Map<string, PollView>();
  if (polls.length === 0) return out;
  const pjson = JSON.stringify(polls.map((p) => p.post_id));
  const options = (await db
    .prepare(
      `SELECT o.id, o.post_id, o.label, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes
       FROM poll_options o WHERE o.post_id IN ${IN_IDS} ORDER BY o.position`,
    )
    .all(pjson)) as { id: string; post_id: string; label: string; votes: number }[];
  const myVotes = viewerId
    ? new Map(
        ((await db.prepare(`SELECT post_id, option_id FROM poll_votes WHERE user_id = ? AND post_id IN ${IN_IDS}`).all(viewerId, pjson)) as {
          post_id: string;
          option_id: string;
        }[]).map((v) => [v.post_id, v.option_id]),
      )
    : new Map<string, string>();
  const now = Date.now();
  for (const p of polls) {
    const opts = options.filter((o) => o.post_id === p.post_id).map(({ id, label, votes }) => ({ id, label, votes }));
    out.set(p.post_id, {
      options: opts,
      totalVotes: opts.reduce((s, o) => s + o.votes, 0),
      endsAt: p.ends_at,
      closed: p.ends_at <= now,
      myVote: myVotes.get(p.post_id) ?? null,
    });
  }
  return out;
}

/** A feed item: a post, optionally surfaced because someone reposted it. */
export interface FeedItem {
  key: string;
  post: PostView;
  repostedBy: UserSummary | null;
}

export async function hydrateFeed(
  ctx: Ctx,
  viewerId: string | null,
  rows: { post_id: string; reposted_by: string | null }[],
): Promise<FeedItem[]> {
  const posts = new Map((await hydratePosts(ctx, viewerId, rows.map((r) => r.post_id))).map((p) => [p.id, p]));
  const reposterIds = [...new Set(rows.map((r) => r.reposted_by).filter(Boolean) as string[])];
  const reposters = new Map(
    reposterIds.length
      ? ((await ctx.db.prepare(`SELECT * FROM users WHERE id IN ${IN_IDS}`).all(JSON.stringify(reposterIds))) as UserRow[]).map((u) => [u.id, u])
      : [],
  );
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const r of rows) {
    const post = posts.get(r.post_id);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    const by = r.reposted_by ? reposters.get(r.reposted_by) : undefined;
    out.push({ key: `${by ? 'r:' + by.id + ':' : ''}${post.id}`, post, repostedBy: by ? userSummary(by) : null });
  }
  return out;
}
