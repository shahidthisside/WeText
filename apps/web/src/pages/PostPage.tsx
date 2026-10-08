import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { Composer } from '../components/Composer';
import { LoadMore, useInfinite } from '../components/Feed';
import { FocusedPost, PostCard } from '../components/PostCard';
import { EmptyState, ErrorState, PageHeader, PageSpinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Post } from '../lib/types';
import { snippet, useDocumentTitle } from '../lib/useDocumentTitle';

export default function PostPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<{ post: Post | null; ancestors: Post[]; missingParent: boolean }>(`/posts/${id}`),
  });
  const focusRef = useRef<HTMLDivElement>(null);

  const post = q.data?.post;
  const titleName = post?.author?.displayName ?? (post?.isAnonymous ? 'Whisper' : 'Note');
  useDocumentTitle(post ? (post.content ? `${titleName}: ${snippet(post.content)}` : titleName) : 'Note');

  // Keep the focused note in view when earlier notes render above it.
  useLayoutEffect(() => {
    if (q.data?.ancestors.length && focusRef.current) {
      window.scrollTo({ top: focusRef.current.getBoundingClientRect().top + window.scrollY - 90 });
    }
  }, [id, q.data?.ancestors.length]);

  return (
    <div className="mx-auto max-w-[680px]">
      <PageHeader back eyebrow="Thread" title="Note" />
      {q.isPending ? (
        <PageSpinner />
      ) : q.isError ? (
        <EmptyState title={q.error instanceof ApiError && q.error.status === 404 ? 'This note is unavailable' : 'Something went wrong'} body={q.error.message} />
      ) : !q.data.post ? (
        // The note was deleted while this page was open (the cache entry is cleared first, then we navigate away).
        <EmptyState title="This note was deleted" body="It’s no longer available." />
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.missingParent && <p className="rounded-2xl bg-bg-muted px-4 py-3 text-[0.875rem] text-fg-muted">This is a reply to a note that’s no longer available.</p>}
          {q.data.ancestors.map((a) => (
            <PostCard key={a.id} post={a} threadLine hideReplyContext />
          ))}
          <div ref={focusRef}>
            <FocusedPost post={q.data.post} />
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-card shadow-paper">
            <Composer variant="inline" replyTo={q.data.post} placeholder="Write a reply…" />
          </div>
          <Replies postId={id} />
        </div>
      )}
    </div>
  );
}

function Replies({ postId }: { postId: string }) {
  const q = useInfinite<Post>(['replies', postId], `/posts/${postId}/replies`);
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) return <p className="py-10 text-center font-serif text-[1.375rem] italic text-fg-subtle">no replies yet, be the first</p>;
  return (
    <>
      {items.map((p) => (
        <PostCard key={p.id} post={p} hideReplyContext />
      ))}
      <LoadMore hasNext={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => q.fetchNextPage()} />
    </>
  );
}
