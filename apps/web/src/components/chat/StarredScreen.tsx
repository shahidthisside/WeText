import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, Star } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import type { StarredEntry } from '../../lib/types';
import { shortTime } from '../../lib/utils';
import { Avatar, EmptyState, IconButton, PageSpinner, Spinner } from '../ui';
import { GroupAvatar } from './GroupAvatar';

/** The "Starred messages" screen. Tapping a result jumps to its conversation. */
export function StarredScreen({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const q = useInfiniteQuery({
    queryKey: ['starred-messages'],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => api.get<{ items: StarredEntry[]; hasMore: boolean }>(`/me/starred-messages${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => (last.hasMore && last.items.length ? last.items[last.items.length - 1]!.starredAt : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-card md:static md:z-0 md:h-full md:rounded-none">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-2">
        <IconButton label="Back to chats" onClick={onBack}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <h1 className="flex items-center gap-2 text-[1.125rem] font-bold">
          <Star className="size-5 fill-accent text-accent" /> Starred messages
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isPending ? (
          <PageSpinner />
        ) : !items.length ? (
          <EmptyState title="No starred messages" body="Star a message to keep it here for quick access. Open any chat, long-press a message, and tap Star." icon={<Star />} />
        ) : (
          <>
            {items.map((e) => (
              <button
                key={e.message.id}
                type="button"
                onClick={() => navigate(`/chats/${e.conversation.id}?m=${e.message.id}`)}
                className="flex min-h-[64px] w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-bg-hover"
              >
                {e.conversation.isGroup ? (
                  <GroupAvatar title={e.conversation.title} size={44} />
                ) : (
                  <Avatar user={e.conversation.other} anonymous={!e.conversation.other} size={44} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold">
                      {e.conversation.isGroup ? e.conversation.title ?? 'Group' : e.conversation.other?.displayName ?? 'Conversation'}
                    </span>
                    <span className="ml-auto shrink-0 text-[0.75rem] text-fg-muted">{shortTime(e.message.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[0.9375rem] text-fg-muted">
                    {e.message.body || (e.message.audio ? '🎤 Voice message' : e.message.sharedPost ? '📝 Shared note' : e.message.image ? '📷 Photo' : '')}
                  </span>
                </span>
              </button>
            ))}
            {q.hasNextPage && (
              <div className="flex justify-center py-4">
                <IconButton label="Load more" onClick={() => q.fetchNextPage()}>
                  {q.isFetchingNextPage ? <Spinner className="size-4" /> : <span className="text-[0.875rem] font-semibold text-accent">Load more</span>}
                </IconButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
