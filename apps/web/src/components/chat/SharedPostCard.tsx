import { Check, CheckCheck, Clock, FileWarning } from 'lucide-react';
import { Link } from 'react-router';
import type { SharedPost } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui';

/** A compact card for a note shared into chat; links to /post/:id. */
export function SharedPostCard({ post, mine }: { post: SharedPost; mine: boolean }) {
  if (!post.available) {
    return (
      <div className={cn('flex items-center gap-2 px-3.5 py-3 text-[0.875rem]', mine ? 'text-on-accent/80' : 'text-fg-muted')}>
        <FileWarning className="size-4 shrink-0" />
        This note is no longer available
      </div>
    );
  }
  return (
    <Link
      to={`/post/${post.id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex max-w-[280px] flex-col gap-2 px-3.5 py-3 transition-colors',
        mine ? 'bg-on-accent/10 hover:bg-on-accent/15' : 'bg-bg hover:bg-bg-hover',
      )}
    >
      <span className={cn('flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wide', mine ? 'text-on-accent/70' : 'text-fg-subtle')}>
        📝 Shared note
      </span>
      <span className="flex items-center gap-2">
        <Avatar user={post.author} anonymous={!post.author} size={28} />
        <span className={cn('truncate text-[0.8125rem] font-semibold', mine ? 'text-on-accent' : 'text-fg')}>
          {post.author ? post.author.displayName : 'Someone, anonymously'}
        </span>
      </span>
      {post.content && (
        <span className={cn('line-clamp-3 whitespace-pre-wrap text-[0.875rem] leading-snug', mine ? 'text-on-accent/90' : 'text-fg')}>{post.content}</span>
      )}
      {post.media && <img src={post.media.url} alt="" className="max-h-32 w-full rounded-lg object-cover" />}
    </Link>
  );
}

export type Tick = 'sending' | 'sent' | 'seen' | 'failed';

/** Delivery status indicator for the viewer's own messages. */
export function StatusTick({ status, className }: { status: Tick; className?: string }) {
  if (status === 'failed') return null;
  const label = status === 'sending' ? 'Sending' : status === 'seen' ? 'Seen' : 'Sent';
  return (
    <span className={cn('inline-flex items-center', className)} aria-label={label} title={label}>
      {status === 'sending' ? (
        <Clock className="size-3.5" />
      ) : status === 'seen' ? (
        <CheckCheck className="size-4 text-accent" />
      ) : (
        <Check className="size-4" />
      )}
    </span>
  );
}
