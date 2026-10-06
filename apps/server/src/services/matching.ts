import { TRAITS } from '../lib/catalog.js';
import type { Ctx, UserRow } from '../types.js';
import { parseJson, presenceOf, userSummary } from './users.js';

export interface MatchResult {
  user: ReturnType<typeof userSummary> & { bio: string; location: string; interests: string[]; isOnline: boolean; lastSeenAt: number | null };
  score: number; // 0..100
  sharedInterests: string[];
  traitHighlights: string[]; // human-readable alignments, e.g. "Both night owls"
  mutualCount: number;
  /** Per-trait closeness 0..100 (raw slider values are never exposed). */
  vibe: { key: string; low: string; high: string; closeness: number; lean: 'low' | 'high' | 'mid' }[];
}

/**
 * Compatibility score between two people.
 *  - Interests (60%): overlap relative to the smaller set, so someone with a
 *    focused list isn't penalised against a long list.
 *  - Personality (40%): 1 - mean absolute distance across traits both filled in.
 * Missing data falls back to a neutral 0.5 for that component.
 */
export function compatibility(a: UserRow, b: UserRow) {
  const ai = parseJson<string[]>(a.interests, []);
  const bi = new Set(parseJson<string[]>(b.interests, []));
  const shared = ai.filter((i) => bi.has(i));
  const interestScore = ai.length && bi.size ? shared.length / Math.min(ai.length, bi.size) : 0;

  const at = parseJson<Record<string, number>>(a.traits, {});
  const bt = parseJson<Record<string, number>>(b.traits, {});
  const both = TRAITS.filter((t) => typeof at[t.key] === 'number' && typeof bt[t.key] === 'number');
  const traitScore = both.length
    ? 1 - both.reduce((s, t) => s + Math.abs(at[t.key]! - bt[t.key]!), 0) / (both.length * 100)
    : 0.5;

  const highlights: string[] = [];
  for (const t of both) {
    const x = at[t.key]!;
    const y = bt[t.key]!;
    if (Math.abs(x - y) > 20) continue;
    const avg = (x + y) / 2;
    if (avg <= 35) highlights.push(t.lowBoth);
    else if (avg >= 65) highlights.push(t.highBoth);
  }

  const vibe = both.map((t) => {
    const avg = (at[t.key]! + bt[t.key]!) / 2;
    return {
      key: t.key,
      low: t.low,
      high: t.high,
      closeness: Math.round(100 - Math.abs(at[t.key]! - bt[t.key]!)),
      lean: (avg <= 40 ? 'low' : avg >= 60 ? 'high' : 'mid') as 'low' | 'high' | 'mid',
    };
  });
  const score = Math.round((0.6 * interestScore + 0.4 * traitScore) * 100);
  return { score: Math.max(0, Math.min(100, score)), shared, highlights: highlights.slice(0, 3), vibe };
}

/** Ranked people-you-might-click-with, excluding follows, blocks and passes. */
export function suggestMatches(ctx: Ctx, viewer: UserRow, opts: { limit: number; excludeFollowing: boolean; excludePassed: boolean }) {
  const { db } = ctx;
  const candidates = db
    .prepare(
      `SELECT u.* FROM users u
        WHERE u.id != ?1 AND u.onboarded = 1
          AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?1)
          AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?1)
          ${opts.excludeFollowing ? 'AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?1)' : ''}
          ${opts.excludePassed ? 'AND u.id NOT IN (SELECT target_id FROM match_passes WHERE user_id = ?1)' : ''}
        ORDER BY u.last_seen_at DESC LIMIT 500`,
    )
    .all({ 1: viewer.id }) as UserRow[];

  const mutualStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM follows a
      WHERE a.followee_id = ? AND a.status = 'active'
        AND a.follower_id IN (SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'active')`,
  );

  const results: MatchResult[] = candidates.map((u) => {
    const c = compatibility(viewer, u);
    const mutualCount = (mutualStmt.get(u.id, viewer.id) as { n: number }).n;
    return {
      user: {
        ...userSummary(u),
        bio: u.bio,
        location: u.location,
        interests: parseJson<string[]>(u.interests, []),
        ...presenceOf(ctx, u),
      },
      score: c.score,
      sharedInterests: c.shared,
      traitHighlights: c.highlights,
      mutualCount,
      vibe: c.vibe,
    };
  });

  // Small boosts for social proof and being around right now; score shown stays the raw compatibility.
  const rank = (r: MatchResult) => r.score + Math.min(r.mutualCount, 5) * 2 + (r.user.isOnline ? 3 : 0);
  return results.sort((a, b) => rank(b) - rank(a)).slice(0, opts.limit);
}
