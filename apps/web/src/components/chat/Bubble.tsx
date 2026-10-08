import { Forward, Hourglass, Reply } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Message, UserSummary } from '../../lib/types';
import { haptic } from '../../lib/chat';
import { cn, clockTime } from '../../lib/utils';
import { RichText } from '../RichText';
import { Avatar } from '../ui';
import { AudioBubble } from './AudioBubble';
import { SharedPostCard, StatusTick, type Tick } from './SharedPostCard';

/** Short label for a disappearing-message countdown. */
function expiryLabel(expiresAt: number) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'expiring';
  const h = ms / 3_600_000;
  if (h >= 24) return `${Math.round(h / 24)}d`;
  if (h >= 1) return `${Math.round(h)}h`;
  return `${Math.max(1, Math.round(ms / 60000))}m`;
}

export function Bubble({
  m,
  mine,
  other,
  first,
  last,
  highlighted,
  status,
  isGroup,
  senderName,
  senderColor,
  replyName,
  onPhoto,
  onReply,
  onReactQuick,
  onOpenActions,
  onJumpToReply,
  registerRef,
}: {
  m: Message;
  mine: boolean;
  other: Pick<UserSummary, 'displayName' | 'avatarUrl' | 'username'>;
  first: boolean;
  last: boolean;
  highlighted: boolean;
  status: Tick | null;
  /** In a group, show the sender's name above incoming bubbles. */
  isGroup?: boolean;
  senderName?: string;
  senderColor?: string;
  /** For a quoted reply in a group, the original sender's name. */
  replyName?: string;
  onPhoto: (url: string) => void;
  onReply: (m: Message) => void;
  onReactQuick: (m: Message, emoji: string | null) => void;
  onOpenActions: (m: Message) => void;
  onJumpToReply: (id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const [swipe, setSwipe] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  const reactionCount = m.reactions.reduce((s, r) => s + r.userIds.length, 0);

  const radius = mine
    ? cn('rounded-3xl', !first && 'rounded-tr-md', !last && 'rounded-br-md')
    : cn('rounded-3xl', !first && 'rounded-tl-md', !last && 'rounded-bl-md');

  function onPointerDown(e: React.PointerEvent) {
    if (m.deleted || m.pending) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    longPress.current = setTimeout(() => {
      if (!moved.current) {
        haptic();
        onOpenActions(m);
      }
    }, 450);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      moved.current = true;
      if (longPress.current) clearTimeout(longPress.current);
    }
    // Horizontal swipe-to-reply (swipe toward the inside of the bubble).
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      const dir = mine ? Math.min(0, dx) : Math.max(0, dx);
      setSwipe(Math.max(-80, Math.min(80, dir)));
    }
  }
  function endPointer() {
    if (longPress.current) clearTimeout(longPress.current);
    if (Math.abs(swipe) > 48 && !m.deleted && !m.pending) {
      haptic();
      onReply(m);
    }
    setSwipe(0);
    start.current = null;
  }

  const hasBubbleBg = !!(m.body || m.deleted);
  void hasBubbleBg;

  return (
    <div
      ref={(el) => registerRef(m.id, el)}
      className={cn(
        'group flex items-end gap-2 scroll-mt-20 transition-[background] duration-500',
        mine ? 'flex-row-reverse' : 'flex-row',
        first ? 'mt-3' : 'mt-0.5',
        reactionCount > 0 && 'mb-4',
        highlighted && 'rounded-2xl bg-accent-soft/60',
      )}
    >
      {!mine && <div className="w-8 shrink-0">{last && <Avatar user={other} size={32} />}</div>}

      <div
        className={cn('flex max-w-[80%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}
        style={{ transform: swipe ? `translateX(${swipe}px)` : undefined, transition: swipe ? 'none' : 'transform 160ms' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {/* Swipe-to-reply affordance */}
        {Math.abs(swipe) > 10 && (
          <span className={cn('mb-1 flex items-center text-fg-muted', mine ? 'self-start' : 'self-end')}>
            <Reply className="size-4" />
          </span>
        )}

        {/* Group: sender name above the first bubble in an incoming run */}
        {isGroup && !mine && first && senderName && (
          <span className="mb-0.5 px-1 text-[0.75rem] font-bold" style={{ color: senderColor }}>
            {senderName}
          </span>
        )}

        {/* Quoted reply */}
        {m.replyTo && !m.deleted && (
          <button
            type="button"
            onClick={() => m.replyTo && onJumpToReply(m.replyTo.id)}
            className="mb-[-10px] max-w-full truncate rounded-2xl bg-bg-muted/80 px-3 pb-3.5 pt-1.5 text-left text-[0.8125rem] text-fg-muted hover:bg-bg-muted"
          >
            <Reply className="mr-1 inline size-3" />
            {replyName && <span className="font-semibold">{replyName}: </span>}
            {m.replyTo.deleted ? 'Original message was unsent' : m.replyTo.body || (m.replyTo.hasImage ? 'Photo' : 'Message')}
          </button>
        )}

        {(m.forwarded || m.expiresAt) && !m.deleted && (
          <div className={cn('mb-0.5 flex items-center gap-1 text-[0.6875rem] text-fg-subtle', mine ? 'self-end' : 'self-start')}>
            {m.forwarded && (
              <span className="inline-flex items-center gap-0.5">
                <Forward className="size-3" /> Forwarded
              </span>
            )}
            {m.expiresAt && (
              <span className="inline-flex items-center gap-0.5" title="Disappearing message">
                <Hourglass className="size-3" /> {expiryLabel(m.expiresAt)}
              </span>
            )}
          </div>
        )}

        <div className="relative">
          {m.deleted ? (
            <div className={cn('border border-line px-4 py-2 text-[0.9375rem] italic text-fg-muted', radius)}>{mine ? 'You unsent a message' : 'Message unsent'}</div>
          ) : (
            <div
              className={cn(
                'overflow-hidden',
                radius,
                m.failed && 'ring-2 ring-danger',
                m.audio ? (mine ? 'bg-accent' : 'bg-bg-muted') : '',
                m.sharedPost ? (mine ? 'bg-accent' : 'bg-bg-muted') : '',
              )}
            >
              {m.image && (
                <button onClick={() => onPhoto(m.image!.url)} className="block" aria-label="Open photo">
                  <img
                    src={m.image.url}
                    alt=""
                    className="max-h-[320px] w-full max-w-[300px] bg-bg-muted object-cover"
                    style={{ aspectRatio: m.image.width && m.image.height ? `${m.image.width}/${m.image.height}` : undefined }}
                  />
                </button>
              )}
              {m.audio && <AudioBubble url={m.audio.url} durationMs={m.audio.durationMs} mine={mine} seed={m.clientKey ?? m.id} />}
              {m.sharedPost && <SharedPostCard post={m.sharedPost} mine={mine} />}
              {m.body && (
                <div className={cn('px-4 py-2 text-[0.9375rem] leading-snug [overflow-wrap:anywhere]', mine ? 'bg-accent text-on-accent [&_a]:text-on-accent [&_a]:underline' : 'bg-bg-muted text-fg')}>
                  <RichText text={m.body} />
                  {m.editedAt && <span className={cn('ml-1 text-[0.6875rem]', mine ? 'text-on-accent/70' : 'text-fg-muted')}>(edited)</span>}
                </div>
              )}
            </div>
          )}

          {reactionCount > 0 && (
            <button
              type="button"
              onClick={() => onOpenActions(m)}
              className={cn('absolute -bottom-4 flex items-center gap-0.5 rounded-full border border-line bg-bg px-1.5 py-0.5 text-[0.8125rem] shadow-sm', mine ? 'right-2' : 'left-2')}
              aria-label={`Reactions: ${m.reactions.map((r) => r.emoji).join(' ')}`}
            >
              {m.reactions.map((r) => (
                <span key={r.emoji}>{r.emoji}</span>
              ))}
              {reactionCount > 1 && <span className="pl-0.5 text-fg-muted">{reactionCount}</span>}
            </button>
          )}
        </div>

        {/* Time + delivery status for the viewer's own messages */}
        {mine && !m.deleted && (
          <p className={cn('mt-1 flex items-center gap-1 text-[0.6875rem] text-fg-muted', 'self-end')}>
            <span>{clockTime(m.createdAt)}</span>
            {status && <StatusTick status={status} />}
          </p>
        )}
        {m.failed && <p className="mt-0.5 text-[0.75rem] text-danger">Not delivered</p>}
      </div>
      {!m.deleted && !m.pending && (
        <div className={cn('mb-1 hidden items-center gap-0.5 self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:flex')}>
          <button
            type="button"
            aria-label="React"
            onClick={() => onReactQuick(m, null)}
            className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-hover"
          >
            🙂
          </button>
          <button
            type="button"
            aria-label="Reply"
            onClick={() => onReply(m)}
            className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-hover"
          >
            <Reply className="size-4" />
          </button>
          <button
            type="button"
            aria-label="More actions"
            onClick={() => onOpenActions(m)}
            className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-hover"
            title={clockTime(m.createdAt)}
          >
            ⋯
          </button>
        </div>
      )}
    </div>
  );
}
