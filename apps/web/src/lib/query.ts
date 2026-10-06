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

export function updatePostEverywhere(id: string, fn: (p: Post) => Post | null) {
  queryClient.setQueriesData({ predicate: () => true }, (data: unknown) => (data === undefined ? data : deepMap(data, id, fn)));
}

/** Prepend an item to the first page of an infinite list query if it's cached. */
export function prependToInfinite<T>(key: QueryKey, item: T) {
  queryClient.setQueryData(key, (data: { pages: { items: T[] }[]; pageParams: unknown[] } | undefined) => {
    if (!data) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first!, items: [item, ...first!.items] }, ...rest] };
  });
}
