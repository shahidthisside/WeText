import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { FeedItem, Page } from '../lib/types';
import { FeedList, MasonryList } from './PostCard';
import { ErrorState, PageSpinner, Spinner } from './ui';

export function useInfinite<T>(queryKey: QueryKey, url: string, enabled = true) {
  return useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sep = url.includes('?') ? '&' : '?';
      return api.get<Page<T>>(pageParam ? `${url}${sep}cursor=${encodeURIComponent(pageParam)}` : url);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Renders a sentinel that loads the next page as it scrolls into view. */
export function LoadMore({ hasNext, loading, onLoad }: { hasNext: boolean; loading: boolean; onLoad: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNext) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && !loading && onLoad(), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNext, loading, onLoad]);
  if (!hasNext) return null;
  return (
    <div ref={ref} className="flex justify-center py-6 text-accent">
      {loading && <Spinner />}
    </div>
  );
}

export function InfiniteFeed({ queryKey, url, empty, enabled = true, masonry }: { queryKey: QueryKey; url: string; empty: ReactNode; enabled?: boolean; masonry?: boolean | 'narrow' }) {
  const q = useInfinite<FeedItem>(queryKey, url, enabled);
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) return <>{empty}</>;
  return (
    <>
      {masonry ? <MasonryList items={items} narrow={masonry === 'narrow'} /> : <FeedList items={items} />}
      <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
      {!q.hasNextPage && items.length > 8 && <p className="py-10 text-center font-serif text-[1.25rem] italic text-fg-subtle">that’s everything for now</p>}
    </>
  );
}
