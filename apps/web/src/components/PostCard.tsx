import { Hourglass, MessageSquareQuote, Repeat2, VenetianMask } from 'lucide-react';
import { memo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMe } from '../lib/auth';
import { postUrl } from '../lib/posts';
import type { FeedItem, Post, UserSummary } from '../lib/types';
import { MoodChip } from '../lib/moods';
import { cn, compact, fullTime, shortTime } from '../lib/utils';
import { MediaGrid } from './Media';
import { AuthorLine, PollView, PostActions, PostMenu, QuoteEmbed } from './PostParts';
import { RichText } from './RichText';
import { Avatar, VerifiedLock } from './ui';
import { EditedLabel } from './EditHistory';

export { PollView, QuoteEmbed };

function fadeLabel(expiresAt: number) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'fading now';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `fades in ${h}h`;
  return `fades in ${Math.max(1, Math.ceil(ms / 60_000))}m`;
}

function FadeTag({ post, onDark }: { post: Post; onDark?: boolean }) {
  if (!post.expiresAt) return null;
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2 text-[0.75rem] font-semibold', onDark ? 'bg-white/10 text-on-whisper-muted' : 'bg-bg-muted text-fg-muted')} title="This note disappears 24 hours after it was posted">
      <Hourglass className="size-3" /> {fadeLabel(post.expiresAt)}
    </span>
  );
}

export interface PostCardProps {
  post: Post;
  repostedBy?: UserSummary | null;
  /** Draw a connector below the avatar (thread ancestors). */
  threadLine?: boolean;
  hideReplyContext?: boolean;
  noBorder?: boolean;
  /** Render in a masonry column (no outer margins). */
  tile?: boolean;
}

function RepostedBy({ by, onDark }: { by: UserSummary; onDark?: boolean }) {
  const { me } = useMe();
  return (
    <Link to={`/${by.username}`} onClick={(e) => e.stopPropagation()} className={cn('mb-2 flex items-center gap-1.5 text-[0.75rem] font-semibold hover:underline', onDark ? 'text-on-whisper-muted' : 'text-fg-muted')}>
      <Repeat2 className="size-3.5" /> {by.id === me?.id ? 'You reposted' : `${by.displayName} reposted`}
    </Link>
  );
}

/* ------------------------------------------------------------------ Note */

function NoteCard({ post, repostedBy, threadLine, hideReplyContext }: PostCardProps) {
  const navigate = useNavigate();
  const open = () => {
    if (window.getSelection()?.toString()) return;
    navigate(postUrl(post));
  };
  const short = post.content.length < 90 && !post.media.length && !post.poll && !post.quote;
  return (
    <article
      onClick={open}
      aria-label={`Note by ${post.author?.displayName ?? 'someone'}`}
      className="group relative cursor-pointer rounded-[var(--radius-card)] border border-line bg-card p-4 shadow-paper transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_14px_34px_-16px_rgb(0_0_0/0.3)]"
    >
      {threadLine && <span className="absolute -bottom-4 left-[33px] h-4 w-0.5 bg-line-strong" aria-hidden />}
      {repostedBy && <RepostedBy by={repostedBy} />}
      <div className="flex items-center gap-2.5">
        {post.author ? (
          <Link to={`/${post.author.username}`} onClick={(e) => e.stopPropagation()} aria-label={post.author.displayName}>
            <Avatar user={post.author} size={38} />
          </Link>
        ) : (
          <Avatar user={null} anonymous size={38} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[0.9375rem]">
            <AuthorLine post={post} />
            {post.author && <VerifiedLock show={post.author.isPrivate} />}
          </div>
          <div className="flex items-center gap-1.5 text-[0.75rem] text-fg-subtle">
            {post.author && <span className="truncate">@{post.author.username}</span>}
            <span aria-hidden>·</span>
            <Link to={postUrl(post)} onClick={(e) => e.stopPropagation()} className="-mx-2 -my-2 shrink-0 px-2 py-2 hover:underline" title={fullTime(post.createdAt)}>
              <time dateTime={new Date(post.createdAt).toISOString()}>{shortTime(post.createdAt)}</time>
            </Link>
            {post.editedAt && (
              <>
                <span aria-hidden>·</span>
                <EditedLabel postId={post.id} className="-mx-1 px-1 py-1" />
              </>
            )}
          </div>
        </div>
        <PostMenu post={post} />
      </div>

      {(post.mood || post.expiresAt || (post.isAnonymous && post.isMine)) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <MoodChip mood={post.mood} />
          <FadeTag post={post} />
          {post.isAnonymous && post.isMine && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-bg-muted px-2 text-[0.75rem] font-semibold text-fg-muted">
              <VenetianMask className="size-3" /> only you know
            </span>
          )}
        </div>
      )}

      {post.replyTo && !hideReplyContext && (
        <p className="mt-3 text-[0.8125rem] text-fg-muted">
          Replying to{' '}
          {post.replyTo.username ? (
            <Link to={`/${post.replyTo.username}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-accent hover:underline">
              @{post.replyTo.username}
            </Link>
          ) : (
            <span className="font-semibold text-accent">a whisper</span>
          )}
        </p>
      )}

      {post.content && (
        <RichText
          text={post.content}
          className={cn('mt-3 block leading-[1.45]', short ? 'font-display text-[1.375rem] font-semibold leading-tight tracking-tight' : 'text-[0.9375rem]')}
        />
      )}
      {post.poll && <PollView post={post} />}
      <MediaGrid media={post.media} />
      {post.quote && <QuoteEmbed post={post.quote} className="mt-3" />}
      <div className="mt-3 border-t border-line/70 pt-2">
        <PostActions post={post} />
      </div>
    </article>
  );
}

/* --------------------------------------------------------------- Whisper */

function WhisperCard({ post, repostedBy }: PostCardProps) {
  const navigate = useNavigate();
  const open = () => {
    if (window.getSelection()?.toString()) return;
    navigate(postUrl(post));
  };
  const long = post.content.length > 220;
  return (
    <article
      onClick={open}
      aria-label="Whisper"
      className="relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] bg-whisper p-5 text-on-whisper shadow-paper transition-all duration-200 hover:-translate-y-0.5"
    >
      {repostedBy && <RepostedBy by={repostedBy} onDark />}
      <div className="relative flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-on-whisper-muted">
        <VenetianMask className="size-3.5" /> Whisper
        <span aria-hidden>·</span>
        <time dateTime={new Date(post.createdAt).toISOString()} className="normal-case tracking-normal" title={fullTime(post.createdAt)}>
          {shortTime(post.createdAt)}
        </time>
        <span className="ml-auto flex items-center gap-1">
          <PostMenu post={post} onDark />
        </span>
      </div>
      <p className={cn('relative mt-3 whitespace-pre-wrap font-serif leading-[1.18] [overflow-wrap:anywhere]', long ? 'text-[1.5rem]' : 'text-[1.9rem]')}>{post.content}</p>
      {post.poll && <PollView post={post} onDark />}
      <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
        <MoodChip mood={post.mood} onDark />
        <FadeTag post={post} onDark />
        {post.isMine && <span className="inline-flex h-6 items-center rounded-full bg-white/10 px-2 text-[0.75rem] font-semibold text-on-whisper-muted">yours · only you know</span>}
      </div>
      <div className="relative mt-3 border-t border-white/10 pt-2">
        <PostActions post={post} onDark />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ Card */

export const PostCard = memo(function PostCard(props: PostCardProps) {
  // Anonymous top-level posts become whispers; anonymous replies stay as plain notes.
  if (props.post.isAnonymous && !props.post.replyTo) return <WhisperCard {...props} />;
  return <NoteCard {...props} />;
});

/* --------------------------------------------------------- Focused (thread) */

export function FocusedPost({ post }: { post: Post }) {
  const whisper = post.isAnonymous && !post.replyTo;
  return (
    <article className={cn('rounded-[28px] p-5 shadow-paper sm:p-7', whisper ? 'bg-whisper text-on-whisper' : 'border border-line bg-card')}>
      <div className="flex items-center gap-3">
        {post.author ? (
          <Link to={`/${post.author.username}`}>
            <Avatar user={post.author} size={46} />
          </Link>
        ) : (
          <Avatar user={null} anonymous size={46} />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {post.author ? (
            <Link to={`/${post.author.username}`} className="block">
              <span className="flex items-center gap-1 font-display text-[1.0625rem] font-bold hover:underline">
                {post.author.displayName} <VerifiedLock show={post.author.isPrivate} />
              </span>
              <span className="text-[0.875rem] text-fg-muted">@{post.author.username}</span>
            </Link>
          ) : (
            <>
              <span className="block font-display text-[1.0625rem] font-bold">Someone, anonymously</span>
              <span className={cn('text-[0.875rem]', whisper ? 'text-on-whisper-muted' : 'text-fg-muted')}>{post.isMine ? 'Only you know this is yours' : 'Identity hidden'}</span>
            </>
          )}
        </div>
        <PostMenu post={post} onDark={whisper} />
      </div>

      {(post.mood || post.expiresAt) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <MoodChip mood={post.mood} onDark={whisper} size="md" />
          <FadeTag post={post} onDark={whisper} />
        </div>
      )}

      {post.replyTo && (
        <p className={cn('mt-4 text-[0.875rem]', whisper ? 'text-on-whisper-muted' : 'text-fg-muted')}>
          Replying to{' '}
          {post.replyTo.username ? (
            <Link to={`/${post.replyTo.username}`} className="font-semibold text-accent hover:underline">
              @{post.replyTo.username}
            </Link>
          ) : (
            <span className="font-semibold text-accent">a whisper</span>
          )}
        </p>
      )}

      {post.content &&
        (whisper ? (
          <p className="mt-5 whitespace-pre-wrap font-serif text-[2.1rem] leading-[1.15] [overflow-wrap:anywhere]">{post.content}</p>
        ) : (
          <RichText text={post.content} className="mt-4 block text-[1.125rem] leading-[1.5]" />
        ))}
      {post.poll && <PollView post={post} onDark={whisper} />}
      <MediaGrid media={post.media} />
      {post.quote && <QuoteEmbed post={post.quote} className="mt-4" />}

      <div className={cn('mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.875rem]', whisper ? 'text-on-whisper-muted' : 'text-fg-muted')}>
        <time dateTime={new Date(post.createdAt).toISOString()}>{fullTime(post.createdAt)}</time>
        {post.editedAt && <EditedLabel postId={post.id} className="-mx-1 px-1 py-1" />}
        {post.counts.likes > 0 && (
          <span>
            <b className={whisper ? 'text-on-whisper' : 'text-fg'}>{compact(post.counts.likes)}</b> likes
          </span>
        )}
        {post.counts.reposts + post.counts.quotes > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquareQuote className="size-3.5" />
            <b className={whisper ? 'text-on-whisper' : 'text-fg'}>{compact(post.counts.reposts + post.counts.quotes)}</b> shares
          </span>
        )}
      </div>
      <div className={cn('mt-3 border-t pt-2', whisper ? 'border-white/10' : 'border-line')}>
        <PostActions post={post} onDark={whisper} big />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ Lists */

/** A single column of cards, filling its container. */
export function FeedList({ items }: { items: FeedItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((i) => (
        <PostCard key={i.key} post={i.post} repostedBy={i.repostedBy} />
      ))}
    </div>
  );
}

/** Masonry: cards flow into columns without splitting. `narrow` caps at two columns. */
export function MasonryList({ items, narrow }: { items: FeedItem[]; narrow?: boolean }) {
  return (
    <div className={narrow ? 'masonry columns-1 md:columns-2' : 'masonry columns-1 md:columns-2 xl:columns-3'}>
      {items.map((i, n) => (
        <div key={i.key} className="animate-rise" style={{ animationDelay: `${Math.min(n, 8) * 40}ms` }}>
          <PostCard post={i.post} repostedBy={i.repostedBy} tile />
        </div>
      ))}
    </div>
  );
}
