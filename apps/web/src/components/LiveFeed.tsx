import { type QueryKey } from '@tanstack/react-query';
import { ArrowUp, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { prependToInfinite, queryClient } from '../lib/query';
import type { FeedItem, Page } from '../lib/types';
import { useInfinite, LoadMore } from './Feed';
import { FeedList, MasonryList } from './PostCard';
import { ErrorState, PageSpinner } from './ui';

const POLL_MS = 60_000;

/**
 * A feed that stays fresh: it polls the first page every 60s while the tab is
 * visible, surfaces a floating "N new notes" pill that merges them on tap, and
 * supports pull-to-refresh on touch devices.
 */
export function LiveFeed({ queryKey, url, empty, masonry }: { queryKey: QueryKey; url: string; empty: ReactNode; masonry?: boolean | 'narrow' }) {
  const q = useInfinite<FeedItem>(queryKey, url);
  const [fresh, setFresh] = useState<FeedItem[]>([]);
  const pullRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const topKey = items[0]?.key;

  // Poll the first page for notes newer than what we already show.
  const check = useCallback(async () => {
    try {
      const page = await api.get<Page<FeedItem>>(url);
      const known = new Set(items.map((i) => i.key));
      const incoming = page.items.filter((i) => !known.has(i.key));
      // Only count items that are genuinely newer (above the current top).
      if (incoming.length) {
        setFresh((prev) => {
          const seen = new Set(prev.map((i) => i.key));
          return [...incoming.filter((i) => !seen.has(i.key)), ...prev];
        });
      }
    } catch {
      // transient; try again next tick
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, topKey]);

  useEffect(() => {
    if (q.isPending || q.isError) return;
    let id: ReturnType<typeof setInterval>;
    const start = () => {
      id = setInterval(() => {
        if (document.visibilityState === 'visible') check();
      }, POLL_MS);
    };
    start();
    const onVis = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [check, q.isPending, q.isError]);

  const merge = useCallback(() => {
    if (fresh.length) {
      prependToInfinite(queryKey, fresh);
      setFresh([]);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [fresh, queryKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setFresh([]);
    await queryClient.invalidateQueries({ queryKey });
    setRefreshing(false);
  }, [queryKey]);

  // Pull-to-refresh (touch only, only at the very top of the page).
  useEffect(() => {
    const el = pullRef.current;
    if (!el) return;
    if (!matchMedia('(pointer: coarse)').matches) return;
    let startY = 0;
    let active = false;
    const THRESHOLD = 72;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      startY = e.touches[0]!.clientY;
      active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        setPull(0);
        return;
      }
      // Dampened, capped. Don't block native scroll beyond the pull zone.
      const dist = Math.min(dy * 0.5, 90);
      setPull(dist);
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      if (pull >= THRESHOLD) refresh();
      setPull(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [pull, refresh]);

  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div ref={pullRef} className="relative">
      {/* Pull-to-refresh spinner */}
      {(pull > 0 || refreshing) && (
        <div className="pointer-events-none absolute inset-x-0 -top-10 z-10 flex justify-center text-accent" style={{ transform: `translateY(${Math.min(pull, 60)}px)` }} aria-hidden>
          <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pull * 3}deg)` }} />
        </div>
      )}

      {/* "N new notes" pill: only exists while there is something new, so it never leaves a gap or a stray button. */}
      {fresh.length > 0 && (
        <div className="pointer-events-none sticky top-2 z-20 mb-3 flex justify-center">
          <button
            onClick={merge}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[0.875rem] font-bold text-on-accent shadow-lg transition-transform hover:scale-[1.03] active:scale-95"
          >
            <ArrowUp className="size-4" /> {fresh.length} new {fresh.length === 1 ? 'note' : 'notes'}
          </button>
        </div>
      )}

      {!items.length ? (
        <>{empty}</>
      ) : (
        <>
          {masonry ? <MasonryList items={items} narrow={masonry === 'narrow'} /> : <FeedList items={items} />}
          <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
          {!q.hasNextPage && items.length > 8 && <p className="py-10 text-center font-serif text-[1.25rem] italic text-fg-subtle">that’s everything for now</p>}
        </>
      )}
    </div>
  );
}
