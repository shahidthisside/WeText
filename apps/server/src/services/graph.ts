import type { DB } from '../db.js';
import type { UserRow } from '../types.js';

/** Social-graph queries shared across routes. */

export async function followStatus(db: DB, followerId: string, followeeId: string): Promise<'none' | 'pending' | 'active'> {
  const row = (await db
    .prepare('SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?')
    .get(followerId, followeeId)) as { status: 'pending' | 'active' } | undefined;
  return row?.status ?? 'none';
}

export async function isBlockedEither(db: DB, a: string, b: string): Promise<boolean> {
  return !!(await db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
    )
    .get(a, b, b, a));
}

/** Can `viewerId` see content authored by `author`? (blocks + private accounts) */
export async function canViewAuthor(db: DB, viewerId: string | null, author: Pick<UserRow, 'id' | 'is_private'>): Promise<boolean> {
  if (viewerId === author.id) return true;
  if (viewerId && (await isBlockedEither(db, viewerId, author.id))) return false;
  if (!author.is_private) return true;
  return !!viewerId && (await followStatus(db, viewerId, author.id)) === 'active';
}

/** Whether `sender` may start a new DM conversation with `recipient`. */
export async function canStartConversation(db: DB, sender: UserRow, recipient: UserRow): Promise<{ ok: boolean; reason?: string }> {
  if (sender.id === recipient.id) return { ok: false, reason: "You can't message yourself" };
  if (await isBlockedEither(db, sender.id, recipient.id)) return { ok: false, reason: "You can't message this account" };
  if (recipient.dm_policy === 'nobody') return { ok: false, reason: `@${recipient.username} isn't accepting new messages` };
  if (recipient.dm_policy === 'following' && (await followStatus(db, recipient.id, sender.id)) !== 'active') {
    return { ok: false, reason: `@${recipient.username} only accepts messages from people they follow` };
  }
  return { ok: true };
}

/** SQL fragment (single `?` = viewer id) that excludes authors blocked either way or muted by the viewer. */
export const HIDDEN_AUTHORS_SQL = `
  SELECT blocked_id FROM blocks WHERE blocker_id = ?1
  UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?1
  UNION SELECT muted_id FROM mutes WHERE muter_id = ?1`;

export async function hiddenAuthorIds(db: DB, viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = (await db.prepare(HIDDEN_AUTHORS_SQL).pluck().all({ 1: viewerId })) as string[];
  return new Set(rows);
}

export async function blockedEitherIds(db: DB, viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = (await db
    .prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ?1 UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?1')
    .pluck()
    .all({ 1: viewerId })) as string[];
  return new Set(rows);
}

export async function activeFolloweeIds(db: DB, userId: string): Promise<Set<string>> {
  const rows = (await db
    .prepare("SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'active'")
    .pluck()
    .all(userId)) as string[];
  return new Set(rows);
}
