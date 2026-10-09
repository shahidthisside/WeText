import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../app.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { normalizeText } from '../lib/text.js';
import { uploadUrl } from '../lib/validation.js';
import { canStartConversation, followStatus, isBlockedEither } from '../services/graph.js';
import { presenceOf, userSummary } from '../services/users.js';
import {
  MAX_GROUP_MEMBERS,
  MAX_PINNED,
  MESSAGE_REACTIONS,
  COUNTS_AS_UNREAD_SQL,
  TTL_OPTIONS,
  activeMemberIds,
  codePointLength,
  effectiveCleared,
  ensureAdmin,
  groupMembers,
  isRequestFor,
  lastMessagePreview,
  messageViews,
  nameList,
  type ConversationRow,
  type MemberRow,
  type MessageRow,
} from '../services/chat.js';
import type { Ctx, UserRow } from '../types.js';

/** Only audio uploads live under a user's folder with these extensions. */
const audioUrl = z.string().regex(/^\/uploads\/[a-z0-9]+\/[a-zA-Z0-9_-]+\.(webm|ogg|m4a|mp3|wav)$/, 'Invalid upload');

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MESSAGE_SELECT = 'SELECT * FROM messages';

/**
 * Pending message requests and the unread conversation count for the inbox badge.
 * Archived + muted conversations are excluded; marked-unread conversations count.
 * Group conversations are included (never "requests"); messages I sent and system lines don't count.
 */
export async function unreadMessageCounts(ctx: Ctx, userId: string) {
  const now = Date.now();
  // 1:1 conversations (unchanged behaviour, kept byte-for-byte).
  const rows = (await ctx.db
    .prepare(
      `SELECT c.id, o.user_id AS other_id, me.marked_unread, me.archived_at,
         EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ?1
                  AND m.created_at > me.last_read_at AND m.created_at > me.cleared_at AND m.deleted_at IS NULL
                  AND ${COUNTS_AS_UNREAD_SQL}
                  AND (m.expires_at IS NULL OR m.expires_at > ?2)
                  AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?1)) AS unread,
         EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at > me.cleared_at
                  AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > ?2)
                  AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?1)) AS has_messages
       FROM conversation_members me
       JOIN conversations c ON c.id = me.conversation_id AND c.is_group = 0
       JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id != ?1
       WHERE me.user_id = ?1 AND me.muted = 0`,
    )
    .all({ 1: userId, 2: now })) as {
    id: string;
    other_id: string;
    marked_unread: number;
    archived_at: number | null;
    unread: number;
    has_messages: number;
  }[];
  let conversations = 0;
  let requests = 0;
  for (const r of rows) {
    if (r.archived_at) continue; // archived + muted-check already applied -> archived excluded here
    if (!r.has_messages || (await isBlockedEither(ctx.db, userId, r.other_id))) continue;
    if (await isRequestFor(ctx, r.id, userId, r.other_id, now)) {
      requests++;
    } else if (r.unread || r.marked_unread) {
      conversations++;
    }
  }

  // Group conversations: unread user messages from others, excluding system lines, muted/archived
  // conversations and conversations I've left. Groups are never requests.
  const groups = (await ctx.db
    .prepare(
      `SELECT c.id, me.marked_unread,
         EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ?1
                  AND m.kind != 'system' AND ${COUNTS_AS_UNREAD_SQL}
                  AND m.created_at > me.last_read_at
                  AND m.created_at > MAX(me.cleared_at, me.joined_at) AND m.deleted_at IS NULL
                  AND (m.expires_at IS NULL OR m.expires_at > ?2)
                  AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?1)) AS unread
       FROM conversation_members me
       JOIN conversations c ON c.id = me.conversation_id AND c.is_group = 1
       WHERE me.user_id = ?1 AND me.muted = 0 AND me.archived_at IS NULL AND me.left_at IS NULL`,
    )
    .all({ 1: userId, 2: now })) as { id: string; marked_unread: number; unread: number }[];
  for (const g of groups) if (g.unread || g.marked_unread) conversations++;

  return { conversations, requests };
}

const routes: FastifyPluginAsync = async (app) => {
  const ctx = app.ctx;
  const { db } = ctx;
  const now = () => Date.now();

  async function conversation(convId: string): Promise<ConversationRow | undefined> {
    return (await db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId)) as ConversationRow | undefined;
  }

  /**
   * Resolve the viewer's membership plus, for 1:1 conversations, the other member and user.
   * For group conversations `other`/`otherUser` are undefined. Throws 404 if the viewer is not a member.
   */
  async function membership(convId: string, userId: string) {
    const me = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, userId)) as
      | MemberRow
      | undefined;
    if (!me) throw notFound('Conversation not found');
    const conv = await conversation(convId);
    if (conv?.is_group) return { me, other: undefined, otherUser: undefined, conv };
    const other = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(convId, userId)) as
      | MemberRow
      | undefined;
    const otherUser = other ? ((await db.prepare('SELECT * FROM users WHERE id = ?').get(other.user_id)) as UserRow | undefined) : undefined;
    return { me, other, otherUser, conv };
  }

  /** Does `otherUser` block `me`? If so, I can see history but not read/send any more. */
  async function blockedByOther(viewerId: string, otherId: string) {
    return !!(await db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(otherId, viewerId));
  }

  /** Messages visible to `viewer` in a conversation (hidden-for-me and expired excluded). */
  async function visibleMessages(convId: string, viewer: UserRow, me: MemberRow, before?: number, limit = 40) {
    const cleared = effectiveCleared(me);
    // A member who left only sees history up to their left_at.
    const upper = me.left_at ? Math.min(before ?? Number.MAX_SAFE_INTEGER, me.left_at) : (before ?? Number.MAX_SAFE_INTEGER);
    const rows = (await db
      .prepare(
        `${MESSAGE_SELECT} m WHERE m.conversation_id = ? AND m.created_at > ? AND m.created_at < ?
          AND (m.expires_at IS NULL OR m.expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
          ORDER BY m.created_at DESC LIMIT ?`,
      )
      .all(convId, cleared, upper, now(), viewer.id, limit + 1)) as MessageRow[];
    return rows;
  }

  async function lastVisibleMessage(convId: string, viewer: UserRow, me: MemberRow): Promise<MessageRow | undefined> {
    const cleared = effectiveCleared(me);
    const upper = me.left_at ?? Number.MAX_SAFE_INTEGER;
    return (await db
      .prepare(
        `${MESSAGE_SELECT} m WHERE m.conversation_id = ? AND m.created_at > ? AND m.created_at <= ?
          AND (m.expires_at IS NULL OR m.expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
          ORDER BY m.created_at DESC LIMIT 1`,
      )
      .get(convId, cleared, upper, now(), viewer.id)) as MessageRow | undefined;
  }

  async function groupConversationView(conv: ConversationRow, me: MemberRow, viewer: UserRow) {
    // Lazily repair a group that has no active admin (e.g. after the creator's account was deleted).
    await ensureAdmin(ctx, conv.id);
    const left = me.left_at != null;
    const members = await groupMembers(ctx, conv.id);
    const myRow = members.find((m) => m.id === viewer.id);
    const last = await lastVisibleMessage(conv.id, viewer, me);
    const cleared = effectiveCleared(me);
    const unread = (
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages m WHERE m.conversation_id = ? AND m.sender_id != ? AND m.kind != 'system' AND ${COUNTS_AS_UNREAD_SQL}
             AND m.created_at > ? AND m.created_at > ? AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > ?)
             AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)`,
        )
        .get(conv.id, viewer.id, me.last_read_at, cleared, now(), viewer.id)) as { n: number }
    ).n;
    // readBy: active members (excluding me) with their last_read_at.
    const readByRows = (await db
      .prepare('SELECT user_id, last_read_at FROM conversation_members WHERE conversation_id = ? AND user_id != ? AND left_at IS NULL')
      .all(conv.id, viewer.id)) as { user_id: string; last_read_at: number }[];
    const lastView = last ? (await messageViews(ctx, viewer.id, [last]))[0]! : null;
    return {
      id: conv.id,
      isGroup: true,
      title: conv.title,
      other: null as null,
      members,
      memberCount: members.length,
      myRole: (myRow?.role ?? (me.role === 'admin' ? 'admin' : 'member')) as 'admin' | 'member',
      createdBy: conv.created_by,
      readBy: readByRows.map((r) => ({ userId: r.user_id, at: r.last_read_at })),
      lastMessage: lastView ? lastMessagePreview(lastView) : null,
      unread,
      isRequest: false,
      muted: !!me.muted,
      pinned: !!me.pinned_at,
      pinnedAt: me.pinned_at,
      archived: !!me.archived_at,
      markedUnread: !!me.marked_unread,
      ttlSeconds: conv.ttl_seconds ?? 0,
      otherLastReadAt: 0,
      left,
      canSend: !left,
      blockedByMe: false,
      updatedAt: last?.created_at ?? 0,
    };
  }

  async function conversationView(convId: string, viewer: UserRow) {
    const { me, other, otherUser, conv } = await membership(convId, viewer.id);
    if (conv?.is_group) return groupConversationView(conv, me, viewer);
    if (!other || !otherUser) return null;
    const last = await lastVisibleMessage(convId, viewer, me);
    const unread = (
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages m WHERE m.conversation_id = ? AND m.sender_id != ? AND ${COUNTS_AS_UNREAD_SQL} AND m.created_at > ? AND m.created_at > ?
             AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > ?)
             AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)`,
        )
        .get(convId, viewer.id, me.last_read_at, me.cleared_at, now(), viewer.id)) as { n: number }
    ).n;
    const blocked = await isBlockedEither(db, viewer.id, otherUser.id);
    const blockedByMe = !!(await db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(viewer.id, otherUser.id));
    const lastView = last ? (await messageViews(ctx, viewer.id, [last]))[0]! : null;
    return {
      id: convId,
      other: { ...userSummary(otherUser), ...(blocked ? { isOnline: false, lastSeenAt: null } : presenceOf(ctx, otherUser)) },
      lastMessage: lastView ? lastMessagePreview(lastView) : null,
      unread,
      isRequest: await isRequestFor(ctx, convId, viewer.id, otherUser.id),
      muted: !!me.muted,
      pinned: !!me.pinned_at,
      pinnedAt: me.pinned_at,
      archived: !!me.archived_at,
      markedUnread: !!me.marked_unread,
      ttlSeconds: conv?.ttl_seconds ?? 0,
      otherLastReadAt: other.last_read_at,
      canSend: !blocked,
      blockedByMe,
      updatedAt: last?.created_at ?? 0,
    };
  }

  app.get('/conversations', async (req) => {
    const user = requireUser(req);
    const { tab } = z.object({ tab: z.enum(['primary', 'requests', 'archived']).default('primary') }).parse(req.query);
    const ids = (await db
      .prepare(
        `SELECT c.id FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id
          WHERE me.user_id = ? ORDER BY c.last_message_at DESC LIMIT 200`,
      )
      .pluck()
      .all(user.id)) as string[];
    const all = (await Promise.all(ids.map((id) => conversationView(id, user)))).filter((c): c is NonNullable<typeof c> => !!c);
    const items = all.filter((c) => {
      if (!c.lastMessage) return false;
      if (tab === 'archived') return c.archived;
      if (c.archived) return false;
      if (tab === 'requests') return c.isRequest && !c.blockedByMe;
      return !c.isRequest;
    });
    // Primary: pinned first (newest pin first), then by last message.
    if (tab === 'primary') {
      items.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.pinned && b.pinned) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
        return b.updatedAt - a.updatedAt;
      });
    }
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
      return { conversation: await conversationView(existing.id, user) };
    }
    const check = await canStartConversation(db, user, other);
    if (!check.ok) throw forbidden(check.reason);
    const id = newId();
    const ts = now();
    await db.transaction(async () => {
      await db.prepare('INSERT INTO conversations (id, pair_key, created_at, last_message_at) VALUES (?, ?, ?, ?)').run(id, key, ts, ts);
      await db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)').run(id, user.id, id, other.id);
    });
    return { conversation: await conversationView(id, user) };
  });

  // --- Group chats ---------------------------------------------------------

  /** Insert a system message (kind='system') and bump last_message_at. Returns the message id. */
  async function insertSystem(convId: string, senderId: string, body: string, ts = now()) {
    const mid = newId();
    await db
      .prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind) VALUES (?, ?, ?, ?, ?, 'system')`,
      )
      .run(mid, convId, senderId, body, ts);
    await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(ts, convId);
    return mid;
  }

  /** Emit message:new for one message to every active member of a (group) conversation. */
  async function emitNewToMembers(convId: string, mid: string) {
    const row = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(mid)) as MessageRow;
    const members = await activeMemberIds(ctx, convId);
    for (const uid of members) {
      const view = (await messageViews(ctx, uid, [row]))[0]!;
      ctx.rt.emitToUser(uid, 'message:new', { conversationId: convId, message: view });
    }
  }

  /** Notify every active member (plus any extra ids) that membership/title/roles changed. */
  async function emitMembersChanged(convId: string, extraUserIds: string[] = []) {
    const members = await activeMemberIds(ctx, convId);
    for (const uid of new Set([...members, ...extraUserIds])) {
      ctx.rt.emitToUser(uid, 'conversation:members', { conversationId: convId });
    }
  }

  /**
   * Validate that `creator` may add each of `targetIds` to a group: not blocked either way,
   * and the target's DM policy allows it. Returns the usernames that failed.
   */
  async function rejectUnaddable(creator: UserRow, targets: UserRow[]): Promise<string[]> {
    const bad: string[] = [];
    for (const t of targets) {
      const check = await canStartConversation(db, creator, t);
      if (!check.ok) bad.push(t.username);
    }
    return bad;
  }

  app.post('/conversations/group', async (req, reply) => {
    const user = requireUser(req);
    const body = z
      .object({
        title: z.string(),
        memberIds: z.array(z.string().max(32)).min(2).max(MAX_GROUP_MEMBERS - 1),
      })
      .parse(req.body);
    const title = body.title.trim();
    if (codePointLength(title) < 1 || codePointLength(title) > 50) throw badRequest('Group name must be 1 to 50 characters');

    // De-duplicate; a creator cannot add themselves.
    const memberIds = [...new Set(body.memberIds)].filter((id) => id !== user.id);
    if (memberIds.length < 2) throw badRequest('A group needs at least 2 other people');
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) throw badRequest(`A group can have at most ${MAX_GROUP_MEMBERS} members`);

    const targets = (await db
      .prepare('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?))')
      .all(JSON.stringify(memberIds))) as UserRow[];
    if (targets.length !== memberIds.length) throw badRequest('One or more accounts no longer exist');

    const bad = await rejectUnaddable(user, targets);
    if (bad.length) throw forbidden(`You can't add these accounts: ${bad.join(', ')}`);

    // Insert in the order the client listed them so "longest-standing" is deterministic.
    const byId = new Map(targets.map((t) => [t.id, t]));
    const ordered = memberIds.map((id) => byId.get(id)!).filter(Boolean);

    const id = newId();
    const ts = now();
    await db.transaction(async () => {
      await db
        .prepare('INSERT INTO conversations (id, pair_key, created_at, last_message_at, is_group, title, created_by) VALUES (?, ?, ?, ?, 1, ?, ?)')
        .run(id, `g:${id}`, ts, ts, title, user.id);
      await db
        .prepare("INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)")
        .run(id, user.id, ts);
      for (let i = 0; i < ordered.length; i++) {
        await db
          .prepare("INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
          .run(id, ordered[i]!.id, ts);
      }
    });
    await insertSystem(id, user.id, 'created the group', ts);
    await emitNewToMembers(id, (await db.prepare('SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').pluck().get(id)) as string);
    await emitMembersChanged(id);
    return reply.code(201).send({ conversation: await conversationView(id, user) });
  });

  app.post('/conversations/:id/members', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { userIds } = z.object({ userIds: z.array(z.string().max(32)).min(1).max(20) }).parse(req.body);
    const { me, conv } = await membership(id, user.id);
    if (!conv?.is_group) throw badRequest('Not a group conversation');
    if (me.left_at) throw forbidden('You are no longer in this group');
    if (me.role !== 'admin') throw forbidden('Only admins can add members');

    const ids = [...new Set(userIds)].filter((x) => x !== user.id);
    if (!ids.length) throw badRequest('No one to add');
    const targets = (await db.prepare('SELECT * FROM users WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(ids))) as UserRow[];
    if (targets.length !== ids.length) throw badRequest('One or more accounts no longer exist');

    // Current active members: skip anyone already in; count toward the cap.
    const activeNow = new Set(await activeMemberIds(ctx, id));
    const toAdd = targets.filter((t) => !activeNow.has(t.id));
    if (!toAdd.length) throw badRequest('Those people are already in the group');
    if (activeNow.size + toAdd.length > MAX_GROUP_MEMBERS) throw conflict(`A group can have at most ${MAX_GROUP_MEMBERS} members`, 'group_full');

    const bad = await rejectUnaddable(user, toAdd);
    if (bad.length) throw forbidden(`You can't add these accounts: ${bad.join(', ')}`);

    const ts = now();
    await db.transaction(async () => {
      for (const t of toAdd) {
        // Re-adding someone who left: reset their row so they join fresh from now.
        const existing = (await db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(id, t.id)) as
          | 1
          | undefined;
        if (existing) {
          await db
            .prepare(
              "UPDATE conversation_members SET role = 'member', joined_at = ?, left_at = NULL, cleared_at = ?, last_read_at = ?, marked_unread = 0 WHERE conversation_id = ? AND user_id = ?",
            )
            .run(ts, ts, ts, id, t.id);
        } else {
          await db
            .prepare("INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
            .run(id, t.id, ts);
        }
      }
    });
    const mid = await insertSystem(id, user.id, `added ${nameList(toAdd.map((t) => t.display_name))}`, ts);
    await emitNewToMembers(id, mid);
    await emitMembersChanged(id);
    return { conversation: await conversationView(id, user) };
  });

  app.delete('/conversations/:id/members/:userId', async (req) => {
    const user = requireUser(req);
    const { id, userId } = z.object({ id: z.string().max(32), userId: z.string().max(32) }).parse(req.params);
    const { me, conv } = await membership(id, user.id);
    if (!conv?.is_group) throw badRequest('Not a group conversation');
    if (me.left_at) throw forbidden('You are no longer in this group');

    const isSelf = userId === user.id;
    if (!isSelf && me.role !== 'admin') throw forbidden('Only admins can remove members');

    const target = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(id, userId)) as
      | MemberRow
      | undefined;
    if (!target || target.left_at) throw notFound('That person is not in this group');
    const targetUser = (await db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) as UserRow | undefined;

    const ts = now();
    await db.prepare('UPDATE conversation_members SET left_at = ? WHERE conversation_id = ? AND user_id = ?').run(ts, id, userId);
    // If the last admin left, promote the longest-standing remaining member.
    await ensureAdmin(ctx, id);
    const body = isSelf ? 'left' : `removed ${targetUser?.display_name ?? 'someone'}`;
    const mid = await insertSystem(id, user.id, body, ts);
    await emitNewToMembers(id, mid);
    await emitMembersChanged(id, [userId]);
    return { conversation: isSelf ? null : await conversationView(id, user) };
  });

  app.patch('/conversations/:id/members/:userId', async (req) => {
    const user = requireUser(req);
    const { id, userId } = z.object({ id: z.string().max(32), userId: z.string().max(32) }).parse(req.params);
    const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(req.body);
    const { me, conv } = await membership(id, user.id);
    if (!conv?.is_group) throw badRequest('Not a group conversation');
    if (me.left_at) throw forbidden('You are no longer in this group');
    if (me.role !== 'admin') throw forbidden('Only admins can change roles');

    const target = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(id, userId)) as
      | MemberRow
      | undefined;
    if (!target || target.left_at) throw notFound('That person is not in this group');

    if (role === 'member' && target.role === 'admin') {
      const admins = (await db
        .prepare("SELECT COUNT(*) AS n FROM conversation_members WHERE conversation_id = ? AND left_at IS NULL AND role = 'admin'")
        .get(id)) as { n: number };
      if (admins.n <= 1) throw conflict('A group must keep at least one admin', 'last_admin');
    }
    await db.prepare('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?').run(role, id, userId);
    await emitMembersChanged(id);
    return { conversation: await conversationView(id, user) };
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
    const body = z
      .object({
        muted: z.boolean().optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        markedUnread: z.boolean().optional(),
        title: z.string().optional(),
        ttlSeconds: z
          .number()
          .int()
          .refine((v) => (TTL_OPTIONS as readonly number[]).includes(v), 'Invalid disappearing-message duration')
          .optional(),
      })
      .parse(req.body);
    const { me, other, conv } = await membership(id, user.id);
    const isGroup = !!conv?.is_group;
    const isAdmin = me.role === 'admin' && !me.left_at;

    if (body.pinned === true && !me.pinned_at) {
      const pins = (await db.prepare('SELECT COUNT(*) AS n FROM conversation_members WHERE user_id = ? AND pinned_at IS NOT NULL').get(user.id)) as {
        n: number;
      };
      if (pins.n >= MAX_PINNED) throw conflict(`You can pin at most ${MAX_PINNED} chats`, 'pin_limit');
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.muted !== undefined) {
      sets.push('muted = ?');
      vals.push(body.muted ? 1 : 0);
    }
    if (body.pinned !== undefined) {
      sets.push('pinned_at = ?');
      vals.push(body.pinned ? now() : null);
    }
    if (body.archived !== undefined) {
      sets.push('archived_at = ?');
      vals.push(body.archived ? now() : null);
    }
    if (body.markedUnread !== undefined) {
      sets.push('marked_unread = ?');
      vals.push(body.markedUnread ? 1 : 0);
    }
    if (sets.length) {
      await db.prepare(`UPDATE conversation_members SET ${sets.join(', ')} WHERE conversation_id = ? AND user_id = ?`).run(...vals, id, user.id);
    }

    // Group title: admins only.
    if (body.title !== undefined) {
      if (!isGroup) throw badRequest('Only group chats have a title');
      if (!isAdmin) throw forbidden('Only admins can rename the group');
      const title = body.title.trim();
      if (codePointLength(title) < 1 || codePointLength(title) > 50) throw badRequest('Group name must be 1 to 50 characters');
      await db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, id);
      for (const uid of await activeMemberIds(ctx, id)) ctx.rt.emitToUser(uid, 'conversation:updated', { conversationId: id, title });
      await emitMembersChanged(id);
    }

    if (body.ttlSeconds !== undefined) {
      if (isGroup && !isAdmin) throw forbidden('Only admins can change disappearing messages');
      await db.prepare('UPDATE conversations SET ttl_seconds = ? WHERE id = ?').run(body.ttlSeconds, id);
      if (isGroup) {
        for (const uid of await activeMemberIds(ctx, id)) ctx.rt.emitToUser(uid, 'conversation:updated', { conversationId: id, ttlSeconds: body.ttlSeconds });
      } else {
        ctx.rt.emitToUser(user.id, 'conversation:updated', { conversationId: id, ttlSeconds: body.ttlSeconds });
        if (other) ctx.rt.emitToUser(other.user_id, 'conversation:updated', { conversationId: id, ttlSeconds: body.ttlSeconds });
      }
    }
    return { conversation: await conversationView(id, user) };
  });

  /** "Delete" for me: hides history before now; the other person keeps theirs. */
  app.delete('/conversations/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    await membership(id, user.id);
    const ts = now();
    await db
      .prepare('UPDATE conversation_members SET cleared_at = ?, last_read_at = ?, marked_unread = 0 WHERE conversation_id = ? AND user_id = ?')
      .run(ts, ts, id, user.id);
    return { ok: true };
  });

  app.get('/conversations/:id/messages', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const q = z.object({ before: z.coerce.number().optional() }).parse(req.query);
    const { me, otherUser } = await membership(id, user.id);
    if (otherUser && (await blockedByOther(user.id, otherUser.id))) throw forbidden("You can't view this conversation");
    const rows = await visibleMessages(id, user, me, q.before, 40);
    const page = rows.slice(0, 40).reverse();
    return { items: await messageViews(ctx, user.id, page), hasMore: rows.length > 40 };
  });

  app.get('/conversations/:id/search', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { q } = z.object({ q: z.string().trim().min(2, 'Search for at least 2 characters').max(80) }).parse(req.query);
    const { me, otherUser } = await membership(id, user.id);
    if (otherUser && (await blockedByOther(user.id, otherUser.id))) throw forbidden("You can't view this conversation");
    const cleared = effectiveCleared(me);
    const upper = me.left_at ?? Number.MAX_SAFE_INTEGER;
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    const rows = (await db
      .prepare(
        `${MESSAGE_SELECT} m WHERE m.conversation_id = ? AND m.created_at > ? AND m.created_at <= ? AND m.deleted_at IS NULL
          AND (m.expires_at IS NULL OR m.expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
          AND m.body LIKE ? ESCAPE '\\'
          ORDER BY m.created_at DESC LIMIT 50`,
      )
      .all(id, cleared, upper, now(), user.id, like)) as MessageRow[];
    return { items: await messageViews(ctx, user.id, rows) };
  });

  app.get('/conversations/:id/media', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const q = z.object({ kind: z.enum(['image', 'audio']), before: z.coerce.number().optional() }).parse(req.query);
    const { me, otherUser } = await membership(id, user.id);
    if (otherUser && (await blockedByOther(user.id, otherUser.id))) throw forbidden("You can't view this conversation");
    const cleared = effectiveCleared(me);
    const leftUpper = me.left_at ?? Number.MAX_SAFE_INTEGER;
    const col = q.kind === 'image' ? 'm.image_url IS NOT NULL' : 'm.audio_url IS NOT NULL';
    const upper = Math.min(q.before ?? Number.MAX_SAFE_INTEGER, leftUpper);
    const rows = (await db
      .prepare(
        `${MESSAGE_SELECT} m WHERE m.conversation_id = ? AND m.created_at > ? AND m.created_at < ? AND m.deleted_at IS NULL AND ${col}
          AND (m.expires_at IS NULL OR m.expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
          ORDER BY m.created_at DESC LIMIT 41`,
      )
      .all(id, cleared, upper, now(), user.id)) as MessageRow[];
    const page = rows.slice(0, 40);
    return { items: await messageViews(ctx, user.id, page), hasMore: rows.length > 40 };
  });

  const sendSchema = z.object({
    body: z.string().max(8000).default(''),
    image: z.object({ url: uploadUrl, width: z.number().int().positive(), height: z.number().int().positive() }).nullish(),
    audio: z.object({ url: audioUrl, durationMs: z.number().int().min(500).max(180000) }).nullish(),
    postId: z.string().max(32).nullish(),
    replyToId: z.string().max(32).nullish(),
  });

  /** Shared creation path, also used by forward. Caller passes resolved fields. */
  async function insertMessage(opts: {
    convId: string;
    senderId: string;
    body: string;
    image: { url: string; width: number; height: number } | null;
    audio: { url: string; durationMs: number } | null;
    postId: string | null;
    replyToId: string | null;
    forwarded: boolean;
    ttlSeconds: number;
  }) {
    const mid = newId();
    const ts = now();
    const expiresAt = opts.ttlSeconds > 0 ? ts + opts.ttlSeconds * 1000 : null;
    await db.transaction(async () => {
      await db
        .prepare(
          `INSERT INTO messages (id, conversation_id, sender_id, body, image_url, image_w, image_h, reply_to_id, created_at,
             forwarded, post_id, audio_url, audio_ms, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          mid,
          opts.convId,
          opts.senderId,
          opts.body,
          opts.image?.url ?? null,
          opts.image?.width ?? null,
          opts.image?.height ?? null,
          opts.replyToId ?? null,
          ts,
          opts.forwarded ? 1 : 0,
          opts.postId ?? null,
          opts.audio?.url ?? null,
          opts.audio?.durationMs ?? null,
          expiresAt,
        );
      await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(ts, opts.convId);
      // Sending implies you've read everything and clears your own "marked unread".
      await db
        .prepare('UPDATE conversation_members SET last_read_at = ?, marked_unread = 0 WHERE conversation_id = ? AND user_id = ?')
        .run(ts, opts.convId, opts.senderId);
      // An incoming message auto-unarchives it for the recipients.
      await db
        .prepare('UPDATE conversation_members SET archived_at = NULL WHERE conversation_id = ? AND user_id != ?')
        .run(opts.convId, opts.senderId);
    });
    return mid;
  }

  /**
   * Emit message:new. For 1:1, to sender + other. For groups, to all active members.
   * `otherId` is only used for 1:1 conversations.
   */
  async function emitNew(convId: string, senderId: string, otherId: string | undefined, mid: string, isGroup: boolean) {
    const row = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(mid)) as MessageRow;
    if (isGroup) {
      const members = await activeMemberIds(ctx, convId);
      let forSender = (await messageViews(ctx, senderId, [row]))[0]!;
      for (const uid of members) {
        const view = (await messageViews(ctx, uid, [row]))[0]!;
        if (uid === senderId) forSender = view;
        ctx.rt.emitToUser(uid, 'message:new', { conversationId: convId, message: view });
      }
      return forSender;
    }
    const forSender = (await messageViews(ctx, senderId, [row]))[0]!;
    ctx.rt.emitToUser(senderId, 'message:new', { conversationId: convId, message: forSender });
    if (otherId) {
      const forOther = (await messageViews(ctx, otherId, [row]))[0]!;
      ctx.rt.emitToUser(otherId, 'message:new', { conversationId: convId, message: forOther });
    }
    return forSender;
  }

  app.post(
    '/conversations/:id/messages',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const user = requireUser(req);
      const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
      const body = sendSchema.parse(req.body);
      const text = normalizeText(body.body);
      if (!text && !body.image && !body.audio && !body.postId) throw badRequest('Message is empty');
      if (codePointLength(text) > 2000) throw badRequest('Messages can be at most 2000 characters');
      if (body.image && !body.image.url.startsWith(`/uploads/${user.id}/`)) throw forbidden('Invalid upload');
      if (body.audio && !body.audio.url.startsWith(`/uploads/${user.id}/`)) throw forbidden('Invalid upload');

      const { me, other, otherUser, conv } = await membership(id, user.id);
      const isGroup = !!conv?.is_group;
      if (isGroup) {
        if (me.left_at) throw forbidden('You are no longer in this group');
      } else {
        if (!other || !otherUser) throw badRequest('This account no longer exists');
        if (await isBlockedEither(db, user.id, otherUser.id)) throw forbidden("You can't message this account");
      }

      if (body.replyToId && !(await db.prepare("SELECT 1 FROM messages WHERE id = ? AND conversation_id = ? AND kind = 'user'").get(body.replyToId, id))) {
        throw badRequest('The message you replied to no longer exists');
      }
      if (body.postId) {
        const post = (await db
          .prepare('SELECT p.id, p.author_id, p.is_anonymous, u.is_private FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?')
          .get(body.postId)) as { id: string; author_id: string; is_anonymous: number; is_private: number } | undefined;
        // Must exist and be visible to the sender.
        let ok = !!post;
        if (post && post.author_id !== user.id) {
          if (await isBlockedEither(db, user.id, post.author_id)) ok = false;
          else if (post.is_private && !post.is_anonymous) ok = (await followStatus(db, user.id, post.author_id)) === 'active';
        }
        if (!ok) throw badRequest('That note is no longer available');
      }

      const ttlSeconds = conv?.ttl_seconds ?? 0;
      const mid = await insertMessage({
        convId: id,
        senderId: user.id,
        body: text,
        image: body.image ? { url: body.image.url, width: body.image.width, height: body.image.height } : null,
        audio: body.audio ? { url: body.audio.url, durationMs: body.audio.durationMs } : null,
        postId: body.postId ?? null,
        replyToId: body.replyToId ?? null,
        forwarded: false,
        ttlSeconds,
      });
      const msg = await emitNew(id, user.id, otherUser?.id, mid, isGroup);
      return reply.code(201).send({ message: msg });
    },
  );

  app.post('/conversations/:id/read', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { other, conv } = await membership(id, user.id);
    const ts = now();
    await db
      .prepare('UPDATE conversation_members SET last_read_at = ?, marked_unread = 0 WHERE conversation_id = ? AND user_id = ?')
      .run(ts, id, user.id);
    if (conv?.is_group) {
      for (const uid of await activeMemberIds(ctx, id)) ctx.rt.emitToUser(uid, 'conversation:read', { conversationId: id, userId: user.id, at: ts });
    } else {
      ctx.rt.emitToUser(user.id, 'conversation:read', { conversationId: id, userId: user.id, at: ts });
      if (other) ctx.rt.emitToUser(other.user_id, 'conversation:read', { conversationId: id, userId: user.id, at: ts });
    }
    return { ok: true };
  });

  /** Load a message the viewer can act on, plus (for 1:1) the other member and group flag. */
  async function loadMessage(messageId: string, userId: string) {
    const m = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)) as MessageRow | undefined;
    if (!m) throw notFound('Message not found');
    const { me, other, conv } = await membership(m.conversation_id, userId); // throws 404 if not a member
    return { m, me, other, isGroup: !!conv?.is_group };
  }

  async function broadcastUpdate(m: MessageRow, userId: string, otherId: string | undefined, isGroup: boolean) {
    const row = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id)) as MessageRow;
    if (isGroup) {
      const members = await activeMemberIds(ctx, m.conversation_id);
      let forSender = (await messageViews(ctx, userId, [row]))[0]!;
      for (const uid of members) {
        const view = (await messageViews(ctx, uid, [row]))[0]!;
        if (uid === userId) forSender = view;
        ctx.rt.emitToUser(uid, 'message:updated', { conversationId: m.conversation_id, message: view });
      }
      return forSender;
    }
    const forSender = (await messageViews(ctx, userId, [row]))[0]!;
    ctx.rt.emitToUser(userId, 'message:updated', { conversationId: m.conversation_id, message: forSender });
    if (otherId) {
      const forOther = (await messageViews(ctx, otherId, [row]))[0]!;
      ctx.rt.emitToUser(otherId, 'message:updated', { conversationId: m.conversation_id, message: forOther });
    }
    return forSender;
  }

  // Edit a text message within the edit window.
  app.patch('/messages/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { body } = z.object({ body: z.string().max(8000) }).parse(req.body);
    const { m, me, other, isGroup } = await loadMessage(id, user.id);
    if (isGroup && me.left_at) throw forbidden('You are no longer in this group');
    if (m.sender_id !== user.id) throw forbidden('You can only edit your own messages');
    if (m.kind === 'system' || m.kind === 'call') throw badRequest('This line can’t be edited');
    if (m.deleted_at) throw badRequest('This message was unsent');
    if (m.forwarded) throw badRequest('Forwarded messages can’t be edited');
    if (m.audio_url || m.post_id) throw badRequest('Only text messages can be edited');
    const text = normalizeText(body);
    // A caption on an image is fine, but a text-only message can't become empty.
    if (!text && !m.image_url) throw badRequest('Message can’t be empty');
    if (codePointLength(text) > 2000) throw badRequest('Messages can be at most 2000 characters');
    if (now() - m.created_at > EDIT_WINDOW_MS) throw badRequest('The 15-minute edit window has passed');
    await db.prepare('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?').run(text, now(), id);
    return { message: await broadcastUpdate(m, user.id, other?.user_id, isGroup) };
  });

  // Unsend for everyone.
  app.delete('/messages/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { m, me, other, isGroup } = await loadMessage(id, user.id);
    if (isGroup && me.left_at) throw forbidden('You are no longer in this group');
    if (m.sender_id !== user.id) throw forbidden('You can only unsend your own messages');
    if (m.kind === 'system' || m.kind === 'call') throw badRequest('This line can’t be unsent. Use delete for me instead');
    await db.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(now(), id);
    await db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(id);
    return { message: await broadcastUpdate(m, user.id, other?.user_id, isGroup) };
  });

  // Delete for me: hide any message in my conversation. Idempotent.
  app.post('/messages/:id/hide', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    await loadMessage(id, user.id);
    await db.prepare('INSERT OR IGNORE INTO message_hidden (message_id, user_id) VALUES (?, ?)').run(id, user.id);
    return { ok: true };
  });

  // Star / unstar a message for me.
  app.put('/messages/:id/star', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { starred } = z.object({ starred: z.boolean() }).parse(req.body);
    const { m } = await loadMessage(id, user.id);
    if (m.deleted_at) throw badRequest('This message was unsent');
    if (m.kind === 'system' || m.kind === 'call') throw badRequest('This line can’t be starred');
    if (starred) {
      await db.prepare('INSERT OR IGNORE INTO message_stars (message_id, user_id, created_at) VALUES (?, ?, ?)').run(id, user.id, now());
    } else {
      await db.prepare('DELETE FROM message_stars WHERE message_id = ? AND user_id = ?').run(id, user.id);
    }
    const row = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(id)) as MessageRow;
    return { message: (await messageViews(ctx, user.id, [row]))[0]! };
  });

  app.get('/me/starred-messages', async (req) => {
    const user = requireUser(req);
    const q = z.object({ before: z.coerce.number().optional() }).parse(req.query);
    // A member who left a group can keep stars only up to their left_at; the join exposes it.
    const rows = (await db
      .prepare(
        `SELECT m.*, s.created_at AS starred_at FROM message_stars s JOIN messages m ON m.id = s.message_id
          JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
          WHERE s.user_id = ? AND s.created_at < ? AND m.deleted_at IS NULL
            AND m.created_at > MAX(cm.cleared_at, cm.joined_at - 1)
            AND (cm.left_at IS NULL OR m.created_at <= cm.left_at)
            AND (m.expires_at IS NULL OR m.expires_at > ?)
            AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
          ORDER BY s.created_at DESC LIMIT 31`,
      )
      .all(user.id, user.id, q.before ?? Number.MAX_SAFE_INTEGER, now(), user.id)) as (MessageRow & { starred_at: number })[];
    const page = rows.slice(0, 30);
    const views = await messageViews(ctx, user.id, page);
    // Attach the conversation + the other participant (1:1) or group title for each.
    const convIds = [...new Set(page.map((m) => m.conversation_id))];
    const others = new Map<string, { username: string; displayName: string; avatarUrl: string | null }>();
    const groups = new Map<string, { isGroup: true; title: string }>();
    if (convIds.length) {
      const convs = (await db
        .prepare('SELECT id, is_group, title FROM conversations WHERE id IN (SELECT value FROM json_each(?))')
        .all(JSON.stringify(convIds))) as { id: string; is_group: number; title: string }[];
      for (const c of convs) if (c.is_group) groups.set(c.id, { isGroup: true, title: c.title });
      const rowsO = (await db
        .prepare(
          `SELECT cm.conversation_id, u.username, u.display_name, u.avatar_url
             FROM conversation_members cm JOIN users u ON u.id = cm.user_id
             JOIN conversations c ON c.id = cm.conversation_id AND c.is_group = 0
             WHERE cm.conversation_id IN (SELECT value FROM json_each(?)) AND cm.user_id != ?`,
        )
        .all(JSON.stringify(convIds), user.id)) as { conversation_id: string; username: string; display_name: string; avatar_url: string | null }[];
      for (const r of rowsO) others.set(r.conversation_id, { username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url });
    }
    const items = page.map((m, i) => ({
      message: views[i]!,
      conversation: groups.has(m.conversation_id)
        ? { id: m.conversation_id, isGroup: true as const, title: groups.get(m.conversation_id)!.title, other: null }
        : { id: m.conversation_id, other: others.get(m.conversation_id) ?? null },
      starredAt: m.starred_at,
    }));
    return { items, hasMore: rows.length > 30 };
  });

  // Forward a visible message into up to five of my other conversations.
  app.post('/messages/:id/forward', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { conversationIds } = z.object({ conversationIds: z.array(z.string().max(32)).min(1).max(5) }).parse(req.body);
    const { m } = await loadMessage(id, user.id);
    if (m.deleted_at) throw badRequest('This message was unsent');
    if (m.kind === 'system' || m.kind === 'call' || (!m.body && !m.image_url && !m.audio_url && !m.post_id)) throw badRequest('Nothing to forward');

    let sent = 0;
    const failed: { conversationId: string; reason: string }[] = [];
    for (const convId of [...new Set(conversationIds)]) {
      try {
        const target = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, user.id)) as
          | MemberRow
          | undefined;
        if (!target) {
          failed.push({ conversationId: convId, reason: 'not_a_member' });
          continue;
        }
        const conv = await conversation(convId);
        if (conv?.is_group) {
          if (target.left_at) {
            failed.push({ conversationId: convId, reason: 'left' });
            continue;
          }
          const mid = await insertMessage({
            convId,
            senderId: user.id,
            body: m.body,
            image: m.image_url ? { url: m.image_url, width: m.image_w ?? 0, height: m.image_h ?? 0 } : null,
            audio: m.audio_url ? { url: m.audio_url, durationMs: m.audio_ms ?? 0 } : null,
            postId: m.post_id,
            replyToId: null,
            forwarded: true,
            ttlSeconds: conv.ttl_seconds,
          });
          await emitNew(convId, user.id, undefined, mid, true);
          sent++;
          continue;
        }
        const otherMember = (await db.prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(convId, user.id)) as
          | MemberRow
          | undefined;
        if (!otherMember) {
          failed.push({ conversationId: convId, reason: 'unavailable' });
          continue;
        }
        if (await isBlockedEither(db, user.id, otherMember.user_id)) {
          failed.push({ conversationId: convId, reason: 'blocked' });
          continue;
        }
        const mid = await insertMessage({
          convId,
          senderId: user.id,
          body: m.body,
          image: m.image_url ? { url: m.image_url, width: m.image_w ?? 0, height: m.image_h ?? 0 } : null,
          audio: m.audio_url ? { url: m.audio_url, durationMs: m.audio_ms ?? 0 } : null,
          postId: m.post_id,
          replyToId: null,
          forwarded: true,
          ttlSeconds: conv?.ttl_seconds ?? 0,
        });
        await emitNew(convId, user.id, otherMember.user_id, mid, false);
        sent++;
      } catch {
        failed.push({ conversationId: convId, reason: 'unavailable' });
      }
    }
    return { sent, failed };
  });

  app.put('/messages/:id/reaction', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(32) }).parse(req.params);
    const { emoji } = z.object({ emoji: z.enum(MESSAGE_REACTIONS).nullable() }).parse(req.body);
    const { m, me, other, isGroup } = await loadMessage(id, user.id);
    if (m.deleted_at) throw badRequest('Message was unsent');
    if (m.kind === 'system' || m.kind === 'call') throw badRequest('This line can’t be reacted to');
    if (isGroup) {
      if (me.left_at) throw forbidden('You are no longer in this group');
    } else if (other && (await isBlockedEither(db, user.id, other.user_id))) {
      throw forbidden();
    }
    if (emoji) {
      await db
        .prepare(
          'INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at',
        )
        .run(id, user.id, emoji, now());
    } else {
      await db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?').run(id, user.id);
    }
    return { message: await broadcastUpdate(m, user.id, other?.user_id, isGroup) };
  });
};

export default routes;

// Re-exported for other modules that previously imported from here.
export type { MessageView } from '../services/chat.js';
