import { newId } from '../lib/crypto.js';
import type { Ctx } from '../types.js';
import { isBlockedEither } from './graph.js';

export type NotificationType =
  | 'like'
  | 'reply'
  | 'repost'
  | 'quote'
  | 'mention'
  | 'follow'
  | 'follow_request'
  | 'follow_accept';

export async function unreadNotificationCount(ctx: Ctx, userId: string): Promise<number> {
  return (
    (await ctx.db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId)) as { n: number }
  ).n;
}

export async function notify(ctx: Ctx, n: { userId: string; actorId: string; type: NotificationType; postId?: string | null }): Promise<void> {
  const { db } = ctx;
  if (n.userId === n.actorId) return;
  if (await isBlockedEither(db, n.userId, n.actorId)) return;
  if (await db.prepare('SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?').get(n.userId, n.actorId)) return;
  // Avoid duplicate likes/reposts/follows on toggle spam.
  await db.prepare(
    'DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id IS ?',
  ).run(n.userId, n.actorId, n.type, n.postId ?? null);
  await db.prepare('INSERT INTO notifications (id, user_id, actor_id, type, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    newId(),
    n.userId,
    n.actorId,
    n.type,
    n.postId ?? null,
    Date.now(),
  );
  ctx.rt.emitToUser(n.userId, 'notification', { unread: await unreadNotificationCount(ctx, n.userId), type: n.type });
}

export async function unnotify(ctx: Ctx, n: { userId: string; actorId: string; type: NotificationType; postId?: string | null }): Promise<void> {
  const r = await ctx.db
    .prepare('DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id IS ?')
    .run(n.userId, n.actorId, n.type, n.postId ?? null);
  if (r.changes) ctx.rt.emitToUser(n.userId, 'notification', { unread: await unreadNotificationCount(ctx, n.userId) });
}
