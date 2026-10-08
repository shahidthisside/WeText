import type { Ctx, UserRow } from '../types.js';
import { isBlockedEither, followStatus, canStartConversation } from './graph.js';
import { presenceOf, userSummary } from './users.js';

/** The single source of truth for allowed message reactions. */
export const MESSAGE_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙏', '🔥', '👎'] as const;
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number];

/** Disappearing-message TTL options, in seconds. 0 = off. */
export const TTL_OPTIONS = [0, 86400, 604800, 7776000] as const;

/** Maximum conversations a user may pin. */
export const MAX_PINNED = 3;

export interface MessageRow {
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
  edited_at: number | null;
  forwarded: number;
  post_id: string | null;
  audio_url: string | null;
  audio_ms: number | null;
  expires_at: number | null;
  kind?: string;
}

export interface MemberRow {
  conversation_id: string;
  user_id: string;
  last_read_at: number;
  cleared_at: number;
  muted: number;
  pinned_at: number | null;
  archived_at: number | null;
  marked_unread: number;
  role?: string;
  joined_at?: number;
  left_at?: number | null;
}

/** Count code points, not UTF-16 units, so an emoji is one character. */
export function codePointLength(s: string): number {
  return [...s].length;
}

interface SharedPostRow {
  id: string;
  author_id: string;
  content: string;
  is_anonymous: number;
  created_at: number;
  expires_at: number | null;
}

/**
 * Resolve the `sharedPost` field for a batch of messages that reference a post,
 * honouring the viewer's visibility rules (block / private / faded / deleted).
 */
async function loadSharedPosts(
  ctx: Ctx,
  viewerId: string,
  postIds: string[],
): Promise<Map<string, NonNullable<MessageView['sharedPost']>>> {
  const out = new Map<string, NonNullable<MessageView['sharedPost']>>();
  if (!postIds.length) return out;
  const { db } = ctx;
  const now = Date.now();
  const json = JSON.stringify([...new Set(postIds)]);
  const posts = (await db
    .prepare('SELECT id, author_id, content, is_anonymous, created_at, expires_at FROM posts WHERE id IN (SELECT value FROM json_each(?))')
    .all(json)) as SharedPostRow[];
  const byId = new Map(posts.map((p) => [p.id, p]));
  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const authors = new Map(
    authorIds.length
      ? ((await db.prepare('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(authorIds))) as UserRow[]).map(
          (u) => [u.id, u],
        )
      : [],
  );
  const media = new Map<string, string>();
  if (posts.length) {
    const rows = (await db
      .prepare('SELECT post_id, url FROM post_media WHERE post_id IN (SELECT value FROM json_each(?)) ORDER BY position')
      .all(json)) as { post_id: string; url: string }[];
    for (const r of rows) if (!media.has(r.post_id)) media.set(r.post_id, r.url);
  }

  for (const pid of postIds) {
    const p = byId.get(pid);
    if (!p) {
      out.set(pid, { id: pid, available: false });
      continue;
    }
    // Faded (expired) or deleted => unavailable.
    if (p.expires_at != null && p.expires_at <= now) {
      out.set(pid, { id: pid, available: false });
      continue;
    }
    const author = authors.get(p.author_id);
    if (!author) {
      out.set(pid, { id: pid, available: false });
      continue;
    }
    // Visibility: blocked either way, or private & not followed (anonymous posts stay public).
    const isMine = p.author_id === viewerId;
    let visible = true;
    if (!isMine) {
      if (await isBlockedEither(db, viewerId, author.id)) visible = false;
      else if (author.is_private && !p.is_anonymous) {
        visible = (await followStatus(db, viewerId, author.id)) === 'active';
      }
    }
    if (!visible) {
      out.set(pid, { id: pid, available: false });
      continue;
    }
    const anonymous = !!p.is_anonymous && !isMine;
    out.set(pid, {
      id: p.id,
      available: true,
      content: p.content.slice(0, 200),
      createdAt: p.created_at,
      author: anonymous
        ? null
        : { username: author.username, displayName: author.display_name, avatarUrl: author.avatar_url },
      media: media.has(p.id) ? { url: media.get(p.id)! } : null,
    });
  }
  return out;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  image: { url: string; width: number; height: number } | null;
  audio: { url: string; durationMs: number } | null;
  sharedPost:
    | null
    | { id: string; available: false }
    | {
        id: string;
        available: true;
        content: string;
        createdAt: number;
        author: { username: string; displayName: string; avatarUrl: string | null } | null;
        media: { url: string } | null;
      };
  replyTo:
    | null
    | { id: string; senderId: string | null; body: string; hasImage: boolean; deleted: boolean };
  createdAt: number;
  editedAt: number | null;
  forwarded: boolean;
  deleted: boolean;
  expiresAt: number | null;
  starred: boolean;
  reactions: { emoji: string; userIds: string[] }[];
  /** 'user' for normal messages, 'system' for group event lines ("Ana added Ben"). On ALL views. */
  kind: 'user' | 'system';
  /** Only populated for messages in group conversations, so group UIs can show the author. */
  sender: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
}

/**
 * Turn message rows into API views for a specific viewer. Resolves reactions,
 * reply previews, shared-post visibility and the viewer's starred flag.
 */
export async function messageViews(ctx: Ctx, viewerId: string, rows: MessageRow[]): Promise<MessageView[]> {
  if (!rows.length) return [];
  const { db } = ctx;
  const ids = JSON.stringify(rows.map((r) => r.id));
  const reactions = (await db
    .prepare(
      'SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (SELECT value FROM json_each(?)) ORDER BY created_at',
    )
    .all(ids)) as { message_id: string; user_id: string; emoji: string }[];
  const stars = new Set(
    (await db
      .prepare('SELECT message_id FROM message_stars WHERE user_id = ? AND message_id IN (SELECT value FROM json_each(?))')
      .pluck()
      .all(viewerId, ids)) as string[],
  );
  const replyIds = rows.map((r) => r.reply_to_id).filter(Boolean) as string[];
  const replies = new Map(
    replyIds.length
      ? ((await db.prepare('SELECT * FROM messages WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(replyIds))) as MessageRow[]).map(
          (m) => [m.id, m],
        )
      : [],
  );
  const sharedPostIds = rows.filter((r) => !r.deleted_at && r.post_id).map((r) => r.post_id!) as string[];
  const shared = await loadSharedPosts(ctx, viewerId, sharedPostIds);

  // Group messages carry a `sender` object so group UIs can show who spoke. Determine which of
  // these messages belong to group conversations, then batch-load their senders once.
  const convIds = [...new Set(rows.map((r) => r.conversation_id))];
  const groupConvIds = new Set(
    convIds.length
      ? ((await db
          .prepare('SELECT id FROM conversations WHERE is_group = 1 AND id IN (SELECT value FROM json_each(?))')
          .pluck()
          .all(JSON.stringify(convIds))) as string[])
      : [],
  );
  const senderIds = [...new Set(rows.filter((r) => groupConvIds.has(r.conversation_id)).map((r) => r.sender_id))];
  const senders = new Map<string, UserRow>(
    senderIds.length
      ? ((await db.prepare('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(senderIds))) as UserRow[]).map(
          (u) => [u.id, u],
        )
      : [],
  );

  return rows.map((m) => {
    const rx = new Map<string, string[]>();
    for (const r of reactions) if (r.message_id === m.id) rx.set(r.emoji, [...(rx.get(r.emoji) ?? []), r.user_id]);
    const reply = m.reply_to_id ? replies.get(m.reply_to_id) : undefined;
    const deleted = !!m.deleted_at;
    const isGroup = groupConvIds.has(m.conversation_id);
    const su = isGroup ? senders.get(m.sender_id) : undefined;
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      body: deleted ? '' : m.body,
      image: !deleted && m.image_url ? { url: m.image_url, width: m.image_w ?? 0, height: m.image_h ?? 0 } : null,
      audio: !deleted && m.audio_url ? { url: m.audio_url, durationMs: m.audio_ms ?? 0 } : null,
      // A message with no text, photo or voice note can only have been a shared note whose original was deleted
      // (the database clears post_id then), so show the "no longer available" card instead of an empty bubble.
      sharedPost: deleted
        ? null
        : m.post_id
          ? shared.get(m.post_id) ?? { id: m.post_id, available: false }
          : !m.body && !m.image_url && !m.audio_url
            ? { id: '', available: false }
            : null,
      replyTo: m.reply_to_id
        ? reply
          ? {
              id: reply.id,
              senderId: reply.sender_id,
              body: reply.deleted_at ? '' : reply.body.slice(0, 140),
              hasImage: !!reply.image_url,
              deleted: !!reply.deleted_at,
            }
          : { id: m.reply_to_id, senderId: null, body: '', hasImage: false, deleted: true }
        : null,
      createdAt: m.created_at,
      editedAt: deleted ? null : m.edited_at,
      forwarded: !!m.forwarded,
      deleted,
      expiresAt: m.expires_at,
      starred: stars.has(m.id),
      reactions: deleted ? [] : [...rx.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
      kind: m.kind === 'system' ? 'system' : 'user',
      sender: su ? { id: su.id, username: su.username, displayName: su.display_name, avatarUrl: su.avatar_url } : null,
    };
  });
}

/** Short preview flags for a conversation's last message. */
export function lastMessagePreview(view: MessageView) {
  return { ...view, audio: !!view.audio, sharedPost: !!view.sharedPost };
}

/** Is this conversation a pending "request" for the viewer? */
export async function isRequestFor(ctx: Ctx, convId: string, viewerId: string, otherId: string, now = Date.now()): Promise<boolean> {
  // I replied => not a request.
  const sent = await ctx.db
    .prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ? AND deleted_at IS NULL LIMIT 1')
    .get(convId, viewerId);
  if (sent) return false;
  // The other person must have actually sent me a visible, non-expired message.
  const received = await ctx.db
    .prepare(
      `SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ? AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`,
    )
    .get(convId, otherId, now);
  if (!received) return false;
  return (await followStatus(ctx.db, viewerId, otherId)) !== 'active';
}

export { isBlockedEither, canStartConversation, presenceOf, userSummary };

// ---------------------------------------------------------------------------
// Group chat helpers
// ---------------------------------------------------------------------------

export const MAX_GROUP_MEMBERS = 50;

export interface ConversationRow {
  id: string;
  pair_key: string;
  created_at: number;
  last_message_at: number;
  ttl_seconds: number;
  is_group: number;
  title: string;
  created_by: string | null;
}

export interface GroupMemberView {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'member';
  isOnline: boolean;
}

/**
 * For reads, a newly-added member only sees messages from their join time onward,
 * on top of their own per-user "cleared" cutoff. Message queries compare with a strict `>`,
 * and `cleared_at` is exclusive while `joined_at` is inclusive (the "X added you" line sits
 * exactly at joined_at and should be visible), so we offset joined_at by 1ms.
 */
export function effectiveCleared(me: Pick<MemberRow, 'cleared_at' | 'joined_at'>): number {
  return Math.max(me.cleared_at ?? 0, (me.joined_at ?? 0) - 1);
}

/** The current active admins of a group (left_at IS NULL, role = 'admin'). */
export async function activeAdminIds(ctx: Ctx, convId: string): Promise<string[]> {
  return (await ctx.db
    .prepare("SELECT user_id FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL AND role = 'admin'")
    .pluck()
    .all(convId)) as string[];
}

/** All active members (left_at IS NULL) of a conversation, ordered by join time. */
export async function activeMemberIds(ctx: Ctx, convId: string): Promise<string[]> {
  return (await ctx.db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL ORDER BY joined_at, rowid')
    .pluck()
    .all(convId)) as string[];
}

/**
 * Promote the longest-standing active member to admin when a group has no active admin.
 * Lazy repair: called whenever a group view is loaded or an admin leaves/is deleted.
 */
export async function ensureAdmin(ctx: Ctx, convId: string): Promise<void> {
  const admins = await activeAdminIds(ctx, convId);
  if (admins.length) return;
  const next = (await ctx.db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL ORDER BY joined_at, rowid LIMIT 1')
    .pluck()
    .get(convId)) as string | undefined;
  if (next) await ctx.db.prepare("UPDATE conversation_members SET role = 'admin' WHERE conversation_id = ? AND user_id = ?").run(convId, next);
}

/** Load active-member summaries (with presence) for a group, batched. Max MAX_GROUP_MEMBERS. */
export async function groupMembers(ctx: Ctx, convId: string): Promise<GroupMemberView[]> {
  const rows = (await ctx.db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.show_online, u.last_seen_at, cm.role
         FROM conversation_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = ? AND cm.left_at IS NULL
        ORDER BY cm.joined_at, cm.rowid LIMIT ?`,
    )
    .all(convId, MAX_GROUP_MEMBERS)) as {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    show_online: number;
    last_seen_at: number;
    role: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role === 'admin' ? 'admin' : 'member',
    isOnline: r.show_online ? ctx.rt.isOnline(r.id) : false,
  }));
}

/** Format a system-message body listing display names ("added Ben, Cara"). */
export function nameList(names: string[]): string {
  return names.join(', ');
}
