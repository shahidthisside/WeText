import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { InfiniteFeed } from '../components/Feed';
import { SearchBox, TrendingList, WhoToFollow } from '../components/Sidebar';
import { UserRow } from '../components/UserRow';
import { EmptyState, ErrorState, PageHeader, PageSpinner, Tabs } from '../components/ui';
import { api } from '../lib/api';
import type { DailyPrompt, UserCard } from '../lib/types';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type T = 'top' | 'latest' | 'people' | 'media';

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const tab = (params.get('f') as T) || 'top';
  const prompt = params.get('prompt') === '1';

  useDocumentTitle(q ? `Search: ${q}` : prompt ? 'Today’s answers' : 'Discover');

  return (
    <div className="mx-auto max-w-[1020px]">
      <PageHeader eyebrow="Discover" title={q ? `Results for “${q}”` : prompt ? 'Today’s answers' : 'See what’s out there'} />
      <div className="mb-6">
        <SearchBox key={q} initial={q} autoFocus={!q && !prompt && matchMedia('(pointer: fine)').matches} />
      </div>

      {prompt && !q ? (
        <PromptAnswers />
      ) : !q ? (
        <div className="space-y-10">
          <TrendingList limit={12} title="Trending now" showEmpty />
          <WhoToFollow />
        </div>
      ) : (
        <>
          <Tabs
            className="mb-6"
            tabs={[
              { value: 'top', label: 'Top' },
              { value: 'latest', label: 'Latest' },
              { value: 'people', label: 'People' },
              { value: 'media', label: 'Media' },
            ]}
            value={tab}
            onChange={(f) => setParams({ q, f }, { replace: true })}
          />
          {tab === 'people' ? (
            <PeopleResults q={q} />
          ) : (
            <>
              {tab === 'top' && <PeopleResults q={q} compact />}
              <InfiniteFeed
                key={`${q}-${tab}`}
                masonry
                queryKey={['search', q, tab]}
                url={`/search?q=${encodeURIComponent(q)}&type=${tab}`}
                empty={<EmptyState title={`Nothing for “${q}”`} body="Try a different word, or check the spelling." />}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function PromptAnswers() {
  const p = useQuery({ queryKey: ['prompt'], queryFn: () => api.get<{ prompt: DailyPrompt }>('/feed/prompt') });
  return (
    <>
      {p.data && (
        <div className="mb-6 rounded-[28px] border border-line bg-card p-6 shadow-paper">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.16em] text-accent">Today’s prompt</p>
          <h2 className="mt-1 font-serif text-[2.2rem] font-normal italic leading-tight tracking-normal">{p.data.prompt.text}</h2>
        </div>
      )}
      <InfiniteFeed
        masonry
        queryKey={['feed', 'prompt']}
        url="/feed/prompt"
        empty={<EmptyState title="No answers yet" body="Go back to Home and be the first." />}
      />
    </>
  );
}

function PeopleResults({ q, compact }: { q: string; compact?: boolean }) {
  const r = useQuery({
    queryKey: ['search-people', q, compact],
    queryFn: () => api.get<{ users: UserCard[] }>(`/search?q=${encodeURIComponent(q)}&type=${compact ? 'top' : 'people'}`),
  });
  if (r.isPending) return compact ? null : <PageSpinner />;
  if (r.isError) return compact ? null : <ErrorState error={r.error} onRetry={() => r.refetch()} />;
  const users = r.data?.users ?? [];
  if (!users.length) return compact ? null : <EmptyState title={`No people found for “${q}”`} />;
  return (
    <section className={compact ? 'mb-8' : ''}>
      {compact && <h2 className="mb-3 text-[1.25rem] font-bold">People</h2>}
      <div className="grid gap-3 sm:grid-cols-2">
        {users.map((u) => (
          <div key={u.id} className="overflow-hidden rounded-[22px] border border-line bg-card shadow-paper">
            <UserRow user={u} />
          </div>
        ))}
      </div>
    </section>
  );
}
