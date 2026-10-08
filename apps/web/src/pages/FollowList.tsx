import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { LoadMore } from '../components/Feed';
import { UserRow } from '../components/UserRow';
import { EmptyState, PageHeader, PageSpinner, Tabs } from '../components/ui';
import { api } from '../lib/api';
import type { Profile, UserCard } from '../lib/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function FollowListPage({ kind }: { kind: 'followers' | 'following' }) {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  useDocumentTitle(`@${username} · ${kind === 'followers' ? 'Followers' : 'Following'}`);
  const profile = useQuery({
    queryKey: ['profile', username.toLowerCase()],
    queryFn: () => api.get<{ user: Profile; canViewContent: boolean }>(`/users/${encodeURIComponent(username)}`),
  });
  const list = useInfiniteQuery({
    queryKey: ['follow-list', username.toLowerCase(), kind],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<{ users: UserCard[]; nextCursor: string | null }>(`/users/${encodeURIComponent(username)}/${kind}${pageParam ? `?cursor=${pageParam}` : ''}`),
    getNextPageParam: (l) => l.nextCursor,
  });
  const u = profile.data?.user;
  const users = list.data?.pages.flatMap((p) => p.users) ?? [];

  return (
    <div className="mx-auto max-w-[680px]">
      <PageHeader back eyebrow={`@${username}`} title={u?.displayName ?? username}>
        <Tabs
          tabs={[
            { value: 'followers', label: 'Followers' },
            { value: 'following', label: 'Following' },
          ]}
          value={kind}
          onChange={(k) => navigate(`/${username}/${k}`, { replace: true })}
        />
      </PageHeader>
      {list.isPending ? (
        <PageSpinner />
      ) : profile.data && !profile.data.canViewContent ? (
        <EmptyState title="This list is private" body={`Only approved followers can see who @${username} follows.`} />
      ) : !users.length ? (
        <EmptyState
          title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          body={kind === 'followers' ? 'When someone follows this account, they’ll show up here.' : 'When this account follows someone, they’ll show up here.'}
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card shadow-paper">
          <div className="divide-y divide-line">
            {users.map((x) => (
              <UserRow key={x.id} user={x} />
            ))}
          </div>
          <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => list.fetchNextPage()} />
        </div>
      )}
    </div>
  );
}
