import { useMutation, useQuery } from '@tanstack/react-query';
import { AtSign, Heart, MessageCircle, Quote, Repeat2, UserCheck, UserPlus, VenetianMask } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { LoadMore, useInfinite } from '../components/Feed';
import { PostCard } from '../components/PostCard';
import { RichText } from '../components/RichText';
import { Avatar, Button, EmptyState, ErrorState, PageHeader, PageSpinner, Tabs } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useCounts } from '../lib/auth';
import { queryClient } from '../lib/query';
import type { Counts, NotificationItem, UserCard } from '../lib/types';
import { cn, shortTime } from '../lib/utils';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const ICONS = {
  like: { icon: Heart, cls: 'text-like', fill: true },
  repost: { icon: Repeat2, cls: 'text-repost', fill: false },
  follow: { icon: UserPlus, cls: 'text-accent', fill: false },
  follow_request: { icon: UserPlus, cls: 'text-accent', fill: false },
  follow_accept: { icon: UserCheck, cls: 'text-accent', fill: false },
  quote: { icon: Quote, cls: 'text-accent', fill: false },
  reply: { icon: MessageCircle, cls: 'text-accent', fill: false },
  mention: { icon: AtSign, cls: 'text-accent', fill: false },
} as const;

function actorNames(n: NotificationItem) {
  const first = n.actors[0];
  const name = first ? first.displayName : 'Someone anonymous';
  const others = n.actorCount - 1;
  return (
    <>
      {first ? (
        <Link to={`/${first.username}`} className="font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
          {name}
        </Link>
      ) : (
        <b>{name}</b>
      )}
      {others > 0 && (
        <>
          {' '}
          and <b>{others === 1 ? '1 other' : `${others} others`}</b>
        </>
      )}
    </>
  );
}

const VERB: Record<NotificationItem['type'], string> = {
  like: 'liked your post',
  repost: 'reposted your post',
  follow: 'followed you',
  follow_request: 'requested to follow you',
  follow_accept: 'accepted your follow request',
  quote: 'quoted your post',
  reply: 'replied to you',
  mention: 'mentioned you',
};

function GroupedNotification({ n }: { n: NotificationItem }) {
  const navigate = useNavigate();
  const meta = ICONS[n.type];
  const Icon = meta.icon;
  const go = () => (n.post ? navigate(`/post/${n.post.id}`) : n.actors[0] && navigate(`/${n.actors[0].username}`));
  return (
    <article
      onClick={go}
      className={cn('flex cursor-pointer gap-4 rounded-[22px] border p-4 shadow-paper transition-all hover:-translate-y-0.5', n.read ? 'border-line bg-card' : 'border-accent/30 bg-card ring-1 ring-accent/20')}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-bg-muted">
        <Icon className={cn('size-5', meta.cls)} fill={meta.fill ? 'currentColor' : 'none'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex gap-1">
          {n.actors.map((a, i) =>
            a ? (
              <Link key={a.id} to={`/${a.username}`} onClick={(e) => e.stopPropagation()}>
                <Avatar user={a} size={32} />
              </Link>
            ) : (
              <Avatar key={`anon-${i}`} user={null} anonymous size={32} />
            ),
          )}
        </div>
        <p className="mt-2 text-[0.9375rem]">
          {actorNames(n)} {VERB[n.type]} <span className="text-fg-muted">· {shortTime(n.createdAt)}</span>
        </p>
        {n.post && n.post.content && <RichText text={n.post.content} className="mt-1 line-clamp-3 block text-[0.9375rem] text-fg-muted" />}
      </div>
    </article>
  );
}

function FollowRequests() {
  const q = useQuery({ queryKey: ['follow-requests'], queryFn: () => api.get<{ users: UserCard[] }>('/me/follow-requests') });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) => api.post(`/me/follow-requests/${id}/${action}`),
    onSuccess: (_d, v) => {
      queryClient.setQueryData<{ users: UserCard[] }>(['follow-requests'], (d) => (d ? { users: d.users.filter((u) => u.id !== v.id) } : d));
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      toast(v.action === 'accept' ? 'Request accepted' : 'Request declined');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const users = q.data?.users ?? [];
  if (!users.length) return null;
  return (
    <section className="mb-5 rounded-[22px] border border-line bg-card p-2 shadow-paper">
      <h2 className="px-3 pb-1 pt-2 font-display text-[1.0625rem] font-bold">Follow requests</h2>
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
          <Link to={`/${u.username}`}>
            <Avatar user={u} size={40} />
          </Link>
          <Link to={`/${u.username}`} className="min-w-0 flex-1 leading-5">
            <p className="truncate font-bold">{u.displayName}</p>
            <p className="truncate text-[0.9375rem] text-fg-muted">@{u.username}</p>
          </Link>
          <Button size="sm" variant="inverse" onClick={() => act.mutate({ id: u.id, action: 'accept' })}>
            Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => act.mutate({ id: u.id, action: 'decline' })}>
            Decline
          </Button>
        </div>
      ))}
    </section>
  );
}

export default function Notifications() {
  const [tab, setTab] = useState<'all' | 'mentions'>('all');
  const counts = useCounts();
  const q = useInfinite<NotificationItem>(['notifications', tab], `/notifications?filter=${tab}`);

  // Mark everything read once the list has loaded.
  const loaded = !!q.data;
  const unread = counts.data?.notifications ?? 0;
  useDocumentTitle(unread > 0 ? `Activity (${unread})` : 'Activity');
  useEffect(() => {
    if (!loaded || !unread) return;
    const t = setTimeout(() => {
      api.post('/notifications/read').catch(() => {});
      queryClient.setQueryData<Counts>(['counts'], (c) => (c ? { ...c, notifications: 0 } : c));
    }, 800);
    return () => clearTimeout(t);
  }, [loaded, unread]);

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-[680px]">
      <PageHeader eyebrow="Activity" title="What’s happening">
        <Tabs
          tabs={[
            { value: 'all', label: 'Everything' },
            { value: 'mentions', label: 'Mentions & replies' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>
      {tab === 'all' && <FollowRequests />}
      {q.isPending ? (
        <PageSpinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState
          title={tab === 'mentions' ? 'Nothing here yet' : 'All quiet'}
          body={tab === 'mentions' ? 'When someone mentions you, replies, or quotes a note, it lands here.' : 'Likes, reposts, follows and replies will show up here.'}
          icon={tab === 'mentions' ? <AtSign /> : <VenetianMask />}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((n) =>
            (n.type === 'reply' || n.type === 'mention' || n.type === 'quote') && n.post ? <PostCard key={n.id} post={n.post} /> : <GroupedNotification key={n.id} n={n} />,
          )}
          <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
        </div>
      )}
    </div>
  );
}
