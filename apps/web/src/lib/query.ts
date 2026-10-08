import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError } from './api';
import type { Post } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

function isPost(v: unknown): v is Post {
  return !!v && typeof v === 'object' && 'counts' in v && 'viewer' in v && 'content' in v && 'id' in v;
}

/**
 * Structurally walk any cached value and rewrite every copy of a post
 * (feeds, threads, quotes, notifications...). Returns the same reference if
 * nothing changed so React Query doesn't re-render needlessly.
 */
function deepMap(v: unknown, id: string, fn: (p: Post) => Post | null): unknown {
  if (Array.isArray(v)) {
    let changed = false;
    const out: unknown[] = [];
    for (const item of v) {
      const m = deepMap(item, id, fn);
      if (m !== item) changed = true;
      // Removing a post from a list: drop list entries that become null, and FeedItems whose post was removed.
      if (m === null) continue;
      if (m && typeof m === 'object' && 'post' in m && 'key' in m && (m as { post: unknown }).post === null) continue;
      out.push(m);
    }
    return changed ? out : v;
  }
  if (v && typeof v === 'object') {
    if (isPost(v) && v.id === id) {
      return fn(v);
    }
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const m = deepMap(val, id, fn);
      if (m !== val) changed = true;
      out[k] = m;
    }
    return changed ? out : v;
  }
  return v;
}

/**
 * Query keys whose cached data can contain Post objects. `updatePostEverywhere`
 * only walks these so unrelated caches (conversations, messages, sessions,
 * follow lists, vibe, meta, counts, trending-tags...) are never touched.
 * Keys are matched on their first segment.
 */
const POST_BEARING_KEYS = new Set([
  'feed', // for-you / following / whispers / tag / prompt feeds
  'post', // a single thread (post + ancestors)
  'replies', // a post's replies
  'profile-posts', // a profile's posts/replies/media/likes/whispers
  'bookmarks', // saved notes
  'notifications', // activity items carry a post
  'search', // search feed results
  'trending', // (tags only, but harmless to include; no posts dropped)
]);

function touchesPosts(key: QueryKey): boolean {
  const first = Array.isArray(key) ? key[0] : key;
  return typeof first === 'string' && POST_BEARING_KEYS.has(first);
}

export function updatePostEverywhere(id: string, fn: (p: Post) => Post | null) {
  queryClient.setQueriesData({ predicate: (q) => touchesPosts(q.queryKey) }, (data: unknown) => (data === undefined ? data : deepMap(data, id, fn)));
}

type InfinitePage<T> = { items: T[]; nextCursor?: string | null };
type InfiniteData<T> = { pages: InfinitePage<T>[]; pageParams: unknown[] };

/**
 * Prepend items to the first page of an infinite list query, if it's cached.
 * Safe against an empty `pages: []` (seeds a first page) and de-dupes by `key`.
 */
export function prependToInfinite<T extends { key?: string; id?: string }>(key: QueryKey, items: T[]) {
  if (!items.length) return;
  queryClient.setQueryData<InfiniteData<T>>(key, (data) => {
    if (!data) return data;
    const idOf = (x: T) => x.key ?? x.id;
    if (!data.pages.length) {
      return { ...data, pages: [{ items, nextCursor: null }], pageParams: [null] };
    }
    const [first, ...rest] = data.pages;
    const existing = new Set(first!.items.map(idOf));
    const fresh = items.filter((x) => !existing.has(idOf(x)));
    if (!fresh.length) return data;
    return { ...data, pages: [{ ...first!, items: [...fresh, ...first!.items] }, ...rest] };
  });
}
