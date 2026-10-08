import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import type { UserCard } from '../lib/types';
import { compact } from '../lib/utils';
import { FollowButton } from './UserRow';
import { Avatar, VerifiedLock } from './ui';
import { InviteButton } from './Invite';

export function SearchBox({ initial = '', autoFocus }: { initial?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/discover?q=${encodeURIComponent(q.trim())}`);
      }}
      className="group flex h-14 items-center gap-3 rounded-full border border-line-strong bg-card px-5 shadow-paper transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft"
    >
      <Search className="size-5 shrink-0 text-fg-subtle group-focus-within:text-accent" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search notes, people, #tags"
        aria-label="Search"
        autoFocus={autoFocus}
        className="h-full min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-fg-subtle"
      />
      {q && (
        <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="flex size-9 items-center justify-center rounded-full bg-bg-muted text-fg-muted hover:bg-line">
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}

/** Trending tags, shared by every place that shows them (same cache entry). */
export function useTrending(limit = 10) {
  const q = useQuery({ queryKey: ['trending'], queryFn: () => api.get<{ tags: { tag: string; posts: number }[] }>('/trending'), staleTime: 120_000 });
  return { tags: q.data?.tags.slice(0, limit) ?? [], isPending: q.isPending };
}

/** Trending tags as a loose cloud of chips: size follows volume. */
export function TrendingList({ limit = 10, title = 'Trending now', showEmpty = false }: { limit?: number; title?: string; showEmpty?: boolean }) {
  const q = useTrending(limit);
  const { tags } = q;
  if (!q.isPending && !tags.length) {
    if (!showEmpty) return null;
    return (
      <section>
        <h2 className="mb-3 text-[1.25rem] font-bold">{title}</h2>
        <div className="rounded-[22px] border border-dashed border-line-strong px-5 py-6">
          <p className="font-display text-[1.0625rem] font-bold">Nothing is trending yet</p>
          <p className="mt-1 max-w-[46ch] text-[0.9375rem] text-fg-muted">
            Tags people use in their notes show up here. Write a note with a #tag, or invite a friend to start the conversation.
          </p>
          <div className="mt-4">
            <InviteButton variant="outline" />
          </div>
        </div>
      </section>
    );
  }
  const max = Math.max(1, ...tags.map((t) => t.posts));
  return (
    <section>
      <h2 className="mb-3 text-[1.25rem] font-bold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {q.isPending
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 w-28 animate-pulse rounded-full bg-bg-muted" />)
          : tags.map((t, i) => {
              const strong = t.posts / max > 0.6;
              return (
                <Link
                  key={t.tag}
                  to={`/tag/${encodeURIComponent(t.tag)}`}
                  className={`inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border px-4 py-2 transition-all hover:-translate-y-0.5 ${strong ? 'border-transparent bg-fg text-bg' : 'border-line-strong bg-card hover:border-fg'}`}
                >
                  <span className="shrink-0 text-[0.6875rem] font-semibold opacity-60">{i + 1}</span>
                  <span className={`min-w-0 truncate font-display font-bold ${strong ? 'text-[1.0625rem]' : 'text-[0.9375rem]'}`}>#{t.tag}</span>
                  <span className="shrink-0 text-[0.75rem] opacity-60">{compact(t.posts)}</span>
                </Link>
              );
            })}
      </div>
    </section>
  );
}

export function WhoToFollow({ title = 'People to meet' }: { title?: string }) {
  const { me } = useMe();
  const q = useQuery({
    queryKey: ['suggestions', me?.id],
    queryFn: () => api.get<{ users: (UserCard & { reason: string | null })[] }>('/suggestions'),
    staleTime: 120_000,
  });
  const users = q.data?.users ?? [];
  if (!q.isPending && !users.length) return null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-[1.25rem] font-bold">{title}</h2>
        {me && (
          <Link to="/connect" className="-my-2 py-2 text-[0.875rem] font-semibold text-accent hover:underline">
            See all matches
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {users.map((u) => (
          <div key={u.id} className="flex flex-col items-center rounded-[22px] border border-line bg-card p-5 text-center shadow-paper">
            <Link to={`/${u.username}`}>
              <Avatar user={u} size={64} online={u.isOnline} />
            </Link>
            <Link to={`/${u.username}`} className="-my-1 mt-3 flex max-w-full items-center gap-1 py-1 font-display font-bold hover:underline">
              <span className="truncate">{u.displayName}</span>
              <VerifiedLock show={u.isPrivate} />
            </Link>
            <p className="mt-0.5 h-4 max-w-full truncate text-[0.75rem] text-fg-muted">{u.reason ?? `@${u.username}`}</p>
            {me && (
              <div className="mt-3">
                <FollowButton user={u} state="none" size="sm" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
