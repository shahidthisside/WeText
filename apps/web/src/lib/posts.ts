import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from './api';
import { queryClient, updatePostEverywhere } from './query';
import type { Post } from './types';

type Flag = 'liked' | 'reposted' | 'bookmarked';
const COUNT: Record<Flag, 'likes' | 'reposts' | null> = { liked: 'likes', reposted: 'reposts', bookmarked: null };
const PATH: Record<Flag, string> = { liked: 'like', reposted: 'repost', bookmarked: 'bookmark' };

function applyFlag(p: Post, flag: Flag, on: boolean): Post {
  if (p.viewer[flag] === on) return p;
  const key = COUNT[flag];
  return {
    ...p,
    viewer: { ...p.viewer, [flag]: on },
    counts: key ? { ...p.counts, [key]: Math.max(0, p.counts[key] + (on ? 1 : -1)) } : p.counts,
  };
}

/** Optimistically toggle like / repost / bookmark everywhere the post is cached. */
export async function togglePostFlag(post: Post, flag: Flag) {
  const on = !post.viewer[flag];
  updatePostEverywhere(post.id, (p) => applyFlag(p, flag, on));
  try {
    if (on) await api.post(`/posts/${post.id}/${PATH[flag]}`);
    else await api.del(`/posts/${post.id}/${PATH[flag]}`);
    if (flag === 'bookmarked') {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      toast(on ? 'Added to bookmarks' : 'Removed from bookmarks');
    }
    if (flag === 'reposted') queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
  } catch (e) {
    updatePostEverywhere(post.id, (p) => applyFlag(p, flag, !on));
    toast.error(errorMessage(e));
  }
}

export function useDeletePost() {
  return useMutation({
    mutationFn: (id: string) => api.del(`/posts/${id}`),
    onSuccess: (_d, id) => {
      updatePostEverywhere(id, () => null);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast('Your post was deleted');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export async function votePoll(post: Post, optionId: string) {
  // Already voted or poll missing: nothing to do.
  if (!post.poll || post.poll.myVote) return;
  // Optimistic vote
  updatePostEverywhere(post.id, (p) =>
    p.poll && !p.poll.myVote
      ? {
          ...p,
          poll: {
            ...p.poll,
            myVote: optionId,
            totalVotes: p.poll.totalVotes + 1,
            options: p.poll.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
          },
        }
      : p,
  );
  try {
    const r = await api.post<{ post: Post }>(`/posts/${post.id}/vote`, { optionId });
    updatePostEverywhere(post.id, () => r.post);
  } catch (e) {
    // Re-apply the inverse of the optimistic change rather than restoring a
    // captured (possibly stale) copy of the whole post.
    updatePostEverywhere(post.id, (p) =>
      p.poll && p.poll.myVote === optionId
        ? {
            ...p,
            poll: {
              ...p.poll,
              myVote: null,
              totalVotes: Math.max(0, p.poll.totalVotes - 1),
              options: p.poll.options.map((o) => (o.id === optionId ? { ...o, votes: Math.max(0, o.votes - 1) } : o)),
            },
          }
        : p,
    );
    // And refetch any thread/feed that holds this post to converge on the truth.
    queryClient.invalidateQueries({ queryKey: ['post', post.id] });
    toast.error(errorMessage(e));
  }
}

export function postUrl(p: Pick<Post, 'id'>) {
  return `/post/${p.id}`;
}

export async function copyLink(p: Pick<Post, 'id'>) {
  const url = `${window.location.origin}${postUrl(p)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied to clipboard');
  } catch {
    toast.error('Couldn’t copy link');
  }
}

/** Copy a note's text to the clipboard. */
export async function copyText(p: Pick<Post, 'content'>) {
  try {
    await navigator.clipboard.writeText(p.content ?? '');
    toast('Text copied');
  } catch {
    toast.error('Couldn’t copy text');
  }
}

/** Share a note via the Web Share API on touch devices, else copy the link. */
export function shareOrCopyLink(p: Pick<Post, 'id'>) {
  const url = `${window.location.origin}${postUrl(p)}`;
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function' && matchMedia('(pointer: coarse)').matches) {
    nav.share({ url }).catch(() => {});
  } else {
    copyLink(p);
  }
}
