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
  // Optimistic vote
  updatePostEverywhere(post.id, (p) =>
    p.poll
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
    updatePostEverywhere(post.id, () => post);
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
