import { Ban, Bookmark, ClipboardCopy, Flag, Heart, Link2, MessageCircle, MoreHorizontal, Pencil, Quote, Repeat2, Send, Share, Trash2, UserMinus, UserPlus, VolumeX } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { openSendPost } from '../lib/chat-share';
import { openComposer } from '../lib/composer';
import { copyLink, copyText, postUrl, shareOrCopyLink, togglePostFlag, useDeletePost, votePoll } from '../lib/posts';
import { queryClient } from '../lib/query';
import type { Post, UserSummary } from '../lib/types';
import { cn, compact, shortTime, timeLeft } from '../lib/utils';
import { MediaGrid } from './Media';
import { ReportDialog } from './ReportDialog';
import { RichText } from './RichText';
import { Avatar, ConfirmDialog, Menu, MenuContent, MenuItem, MenuTrigger } from './ui';

const EDIT_WINDOW = 60 * 60 * 1000;

export function useRequireAuth() {
  const { me } = useMe();
  const navigate = useNavigate();
  return (fn: () => void) => () => {
    if (!me) return navigate('/login');
    fn();
  };
}

/* ------------------------------------------------------------ Action bar */

function Act({
  icon,
  count,
  active,
  tone,
  label,
  onClick,
  onDark,
}: {
  icon: ReactNode;
  count?: number;
  active?: boolean;
  tone: 'like' | 'repost' | 'accent';
  label: string;
  onClick: (e: MouseEvent) => void;
  onDark?: boolean;
}) {
  const on = { like: 'text-like', repost: 'text-repost', accent: 'text-accent' }[tone];
  const hover = { like: 'hover:text-like', repost: 'hover:text-repost', accent: 'hover:text-accent' }[tone];
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={cn(
        'group inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-[0.8125rem] font-medium transition-colors',
        onDark ? 'text-on-whisper-muted hover:bg-white/10' : 'text-fg-muted hover:bg-bg-hover',
        hover,
        active && on,
      )}
    >
      <span className={cn('flex [&>svg]:size-[17px]', active && '[&>svg]:animate-pop')}>{icon}</span>
      {count !== undefined && count > 0 && <span className="tabular-nums">{compact(count)}</span>}
    </button>
  );
}

export function PostActions({ post, onDark, big }: { post: Post; onDark?: boolean; big?: boolean }) {
  const guard = useRequireAuth();
  return (
    <div className={cn('flex items-center justify-between', big ? 'px-1' : '-mx-2')}>
      <Act
        tone="like"
        onDark={onDark}
        label={post.viewer.liked ? 'Unlike' : 'Like'}
        active={post.viewer.liked}
        icon={<Heart fill={post.viewer.liked ? 'currentColor' : 'none'} />}
        count={post.counts.likes}
        onClick={guard(() => togglePostFlag(post, 'liked'))}
      />
      <Act tone="accent" onDark={onDark} label="Reply" icon={<MessageCircle />} count={post.counts.replies} onClick={guard(() => openComposer({ replyTo: post }))} />
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={post.viewer.reposted ? 'Undo repost' : 'Repost'}
            className={cn(
              'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-[0.8125rem] font-medium transition-colors hover:text-repost',
              onDark ? 'text-on-whisper-muted hover:bg-white/10' : 'text-fg-muted hover:bg-bg-hover',
              post.viewer.reposted && 'text-repost',
            )}
          >
            <Repeat2 className="size-[17px]" />
            {post.counts.reposts + post.counts.quotes > 0 && <span className="tabular-nums">{compact(post.counts.reposts + post.counts.quotes)}</span>}
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuItem icon={<Repeat2 />} onSelect={guard(() => togglePostFlag(post, 'reposted'))}>
            {post.viewer.reposted ? 'Undo repost' : 'Repost'}
          </MenuItem>
          <MenuItem icon={<Quote />} onSelect={guard(() => openComposer({ quote: post }))}>
            Quote
          </MenuItem>
        </MenuContent>
      </Menu>
      <Act
        tone="accent"
        onDark={onDark}
        label={post.viewer.bookmarked ? 'Remove from saved' : 'Save'}
        active={post.viewer.bookmarked}
        icon={<Bookmark fill={post.viewer.bookmarked ? 'currentColor' : 'none'} />}
        onClick={guard(() => togglePostFlag(post, 'bookmarked'))}
      />
      <Act
        tone="accent"
        onDark={onDark}
        label="Share"
        icon={<Share />}
        onClick={() => {
          const url = `${location.origin}${postUrl(post)}`;
          if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ url }).catch(() => {});
          else copyLink(post);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ Overflow menu */

export function PostMenu({ post, onDark }: { post: Post; onDark?: boolean }) {
  const { me } = useMe();
  const del = useDeletePost();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(false);
  const author = post.author;
  const canEdit = post.isMine && Date.now() - post.createdAt < EDIT_WINDOW;

  async function relation(action: 'follow' | 'unfollow' | 'mute' | 'block', u: UserSummary) {
    try {
      if (action === 'follow') await api.post(`/users/${u.username}/follow`);
      if (action === 'unfollow') await api.del(`/users/${u.username}/follow`);
      if (action === 'mute') await api.post(`/users/${u.username}/mute`);
      if (action === 'block') await api.post(`/users/${u.username}/block`);
      toast({ follow: `Following @${u.username}`, unfollow: `Unfollowed @${u.username}`, mute: `Muted @${u.username}`, block: `Blocked @${u.username}` }[action]);
      queryClient.invalidateQueries({ queryKey: ['profile', u.username] });
      if (action === 'mute' || action === 'block') queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="More options"
            onClick={(e) => e.stopPropagation()}
            className={cn('-mr-2 flex size-9 items-center justify-center rounded-full transition-colors', onDark ? 'text-on-whisper-muted hover:bg-white/10' : 'text-fg-subtle hover:bg-bg-hover hover:text-fg')}
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        </MenuTrigger>
        <MenuContent>
          {post.isMine ? (
            <>
              {canEdit && (
                <MenuItem icon={<Pencil />} onSelect={() => openComposer({ edit: post })}>
                  Edit
                </MenuItem>
              )}
              <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>
                Delete
              </MenuItem>
            </>
          ) : (
            author &&
            me && (
              <>
                <MenuItem icon={<UserPlus />} onSelect={() => relation('follow', author)}>
                  Follow @{author.username}
                </MenuItem>
                <MenuItem icon={<UserMinus />} onSelect={() => relation('unfollow', author)}>
                  Unfollow @{author.username}
                </MenuItem>
                <MenuItem icon={<VolumeX />} onSelect={() => relation('mute', author)}>
                  Mute @{author.username}
                </MenuItem>
                <MenuItem icon={<Ban />} danger onSelect={() => relation('block', author)}>
                  Block @{author.username}
                </MenuItem>
              </>
            )
          )}
          {post.content && (
            <MenuItem icon={<ClipboardCopy />} onSelect={() => copyText(post)}>
              Copy text
            </MenuItem>
          )}
          <MenuItem icon={<Link2 />} onSelect={() => copyLink(post)}>
            Copy link
          </MenuItem>
          <MenuItem icon={<Share />} onSelect={() => shareOrCopyLink(post)}>
            Share
          </MenuItem>
          {me && (
            <MenuItem icon={<Send />} onSelect={() => openSendPost(post.id)}>
              Send in message
            </MenuItem>
          )}
          {!post.isMine && me && (
            <MenuItem icon={<Flag />} danger onSelect={() => setReport(true)}>
              Report
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      {!post.isMine && me && (
        <ReportDialog
          open={report}
          onOpenChange={setReport}
          target={{
            type: 'post',
            id: post.id,
            username: author?.username,
            onBlock: author ? () => relation('block', author) : undefined,
            onMute: author ? () => relation('mute', author) : undefined,
          }}
        />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this note?"
        body="It will be removed from your profile, feeds and search. This can’t be undone."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(post.id, {
            onSuccess: () => {
              // Deleting the note whose own page is open: go back (or to its parent / home) instead of staring at a dead page.
              if (location.pathname === `/post/${post.id}`) {
                if (post.replyTo) navigate(`/post/${post.replyTo.id}`, { replace: true });
                else if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
                else navigate('/home', { replace: true });
              }
            },
            onSettled: () => setConfirm(false),
          })
        }
      />
    </>
  );
}

/* ------------------------------------------------------------ Poll */

export function PollView({ post, onDark }: { post: Post; onDark?: boolean }) {
  const { me } = useMe();
  const navigate = useNavigate();
  const poll = post.poll!;
  const showResults = poll.closed || !!poll.myVote || post.isMine;
  const max = Math.max(...poll.options.map((o) => o.votes));
  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {poll.options.map((o) => {
        const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
        if (!showResults) {
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => (me ? votePoll(post, o.id) : navigate('/login'))}
              className={cn(
                'h-10 w-full rounded-2xl border px-4 text-left text-[0.9375rem] font-semibold transition-colors',
                onDark ? 'border-white/20 hover:bg-white/10' : 'border-line-strong bg-card hover:border-accent hover:bg-accent-soft',
              )}
            >
              {o.label}
            </button>
          );
        }
        const winner = o.votes === max && max > 0;
        return (
          <div key={o.id} className={cn('relative flex h-10 items-center justify-between overflow-hidden rounded-2xl px-4 text-[0.9375rem]', onDark ? 'bg-white/10' : 'bg-bg-muted')}>
            <div className={cn('absolute inset-y-0 left-0 rounded-2xl transition-[width] duration-700', winner ? 'bg-accent/40' : onDark ? 'bg-white/15' : 'bg-line-strong/70')} style={{ width: `${Math.max(pct, 2)}%` }} />
            <span className={cn('relative truncate', winner && 'font-bold')}>
              {o.label}
              {poll.myVote === o.id && ' ✓'}
            </span>
            <span className={cn('relative tabular-nums', winner && 'font-bold')}>{pct}%</span>
          </div>
        );
      })}
      <p className={cn('text-[0.8125rem]', onDark ? 'text-on-whisper-muted' : 'text-fg-muted')}>
        {compact(poll.totalVotes)} {poll.totalVotes === 1 ? 'vote' : 'votes'} · {timeLeft(poll.endsAt)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Quote embed */

export function QuoteEmbed({ post, className }: { post: Post | { id: string; unavailable: true }; className?: string }) {
  const navigate = useNavigate();
  if ('unavailable' in post) {
    return <div className={cn('rounded-2xl border border-line bg-bg-muted px-4 py-3 text-[0.875rem] text-fg-muted', className)}>This note is unavailable.</div>;
  }
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(postUrl(post));
      }}
      onKeyDown={(e) => e.key === 'Enter' && navigate(postUrl(post))}
      className={cn('cursor-pointer overflow-hidden rounded-2xl border border-line bg-bg/60 transition-colors hover:bg-bg-hover', className)}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 text-[0.8125rem]">
          <Avatar user={post.author} anonymous={!post.author} size={20} />
          <span className="truncate font-bold">{post.author?.displayName ?? 'Someone, anonymously'}</span>
          <span className="shrink-0 text-fg-subtle">{shortTime(post.createdAt)}</span>
        </div>
        {post.content && <RichText text={post.content} className="mt-1.5 line-clamp-5 block text-[0.875rem]" />}
      </div>
      {post.media.length > 0 && <MediaGrid media={post.media} className="mt-0 rounded-none border-0 border-t" />}
    </div>
  );
}

export function AuthorLine({ post, onDark }: { post: Post; onDark?: boolean }) {
  if (!post.author) {
    return <span className={cn('font-display font-bold', onDark ? 'text-on-whisper' : '')}>Someone, anonymously</span>;
  }
  return (
    <Link to={`/${post.author.username}`} onClick={(e) => e.stopPropagation()} className="-my-1 min-w-0 py-1 leading-tight">
      <span className="block truncate font-display font-bold hover:underline">{post.author.displayName}</span>
    </Link>
  );
}
