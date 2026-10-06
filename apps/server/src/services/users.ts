import type { Ctx, UserRow } from '../types.js';
import { followStatus, isBlockedEither, canStartConversation } from './graph.js';

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPrivate: boolean;
}

export function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function userSummary(u: UserRow): UserSummary {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    isPrivate: !!u.is_private,
  };
}

/** Presence as seen by others: hidden entirely if the user turned off "show online". */
export function presenceOf(ctx: Ctx, u: UserRow) {
  if (!u.show_online) return { isOnline: false, lastSeenAt: null };
  const online = ctx.rt.isOnline(u.id);
  return { isOnline: online, lastSeenAt: online ? Date.now() : u.last_seen_at };
}

export function userProfile(ctx: Ctx, u: UserRow, viewerId: string | null) {
  const { db } = ctx;
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM follows WHERE followee_id = ?1 AND status = 'active') AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = ?1 AND status = 'active') AS following,
        (SELECT COUNT(*) FROM posts WHERE author_id = ?1 AND is_anonymous = 0) AS posts`,
    )
    .get({ 1: u.id }) as { followers: number; following: number; posts: number };

  const isSelf = viewerId === u.id;
  let viewer = null as null | {
    following: 'none' | 'pending' | 'active';
    followedBy: boolean;
    blocking: boolean;
    blockedBy: boolean;
    muting: boolean;
    canMessage: boolean;
    mutualFollowers: UserSummary[];
    mutualCount: number;
  };

  if (viewerId && !isSelf) {
    const blocking = !!db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(viewerId, u.id);
    const blockedBy = !!db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(u.id, viewerId);
    const viewerRow = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) as UserRow;
    const existingConv = db
      .prepare('SELECT 1 FROM conversations WHERE pair_key = ?')
      .get([viewerId, u.id].sort().join(':'));
    // "Followed by people you follow": followers of u whom the viewer follows
    const mutualSql = `
      FROM follows a JOIN users x ON x.id = a.follower_id
      WHERE a.followee_id = ?1 AND a.status = 'active'
        AND a.follower_id IN (SELECT followee_id FROM follows WHERE follower_id = ?2 AND status = 'active')`;
    const mutualRows = db.prepare(`SELECT x.* ${mutualSql} LIMIT 3`).all({ 1: u.id, 2: viewerId }) as UserRow[];
    const mutualCount = (db.prepare(`SELECT COUNT(*) AS n ${mutualSql}`).get({ 1: u.id, 2: viewerId }) as { n: number }).n;
    viewer = {
      following: followStatus(db, viewerId, u.id),
      followedBy: followStatus(db, u.id, viewerId) === 'active',
      blocking,
      blockedBy,
      muting: !!db.prepare('SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?').get(viewerId, u.id),
      canMessage: !!existingConv ? !isBlockedEither(db, viewerId, u.id) : canStartConversation(db, viewerRow, u).ok,
      mutualFollowers: mutualRows.map(userSummary),
      mutualCount,
    };
  }

  const blockedBy = viewer?.blockedBy ?? false;
  return {
    ...userSummary(u),
    bio: blockedBy ? '' : u.bio,
    location: blockedBy ? '' : u.location,
    website: blockedBy ? '' : u.website,
    bannerUrl: u.banner_url,
    interests: blockedBy ? [] : parseJson<string[]>(u.interests, []),
    createdAt: u.created_at,
    followersCount: counts.followers,
    followingCount: counts.following,
    postsCount: counts.posts,
    ...(blockedBy ? { isOnline: false, lastSeenAt: null } : presenceOf(ctx, u)),
    isSelf,
    viewer,
  };
}

/** Private fields only the account owner sees. */
export function me(ctx: Ctx, u: UserRow) {
  return {
    ...userProfile(ctx, u, u.id),
    email: u.email,
    traits: parseJson<Record<string, number>>(u.traits, {}),
    dmPolicy: u.dm_policy,
    showOnline: !!u.show_online,
    onboarded: !!u.onboarded,
  };
}
