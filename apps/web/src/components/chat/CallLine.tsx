import { Phone, PhoneMissed, Video } from 'lucide-react';
import { callSummary } from '../../lib/chat';
import type { Message } from '../../lib/types';
import { cn, clockTime } from '../../lib/utils';

/**
 * A call in the chat: who called, how it went and how long it lasted, with a button to call back.
 * Missed calls are in red so they stand out when scrolling.
 */
export function CallLine({
  m,
  meId,
  onCallBack,
  registerRef,
}: {
  m: Message;
  meId: string;
  /** Present when the chat allows calling right now. */
  onCallBack?: (kind: 'audio' | 'video') => void;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
}) {
  const s = callSummary(m, meId);
  if (!s) return null;
  const Icon = s.missed ? PhoneMissed : s.kind === 'video' ? Video : Phone;
  return (
    <div className="my-2 flex justify-center" ref={registerRef ? (el) => registerRef(m.id, el) : undefined}>
      <div className="flex max-w-[94%] items-center gap-2.5 rounded-2xl bg-bg-muted/70 py-2 pl-2.5 pr-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', s.missed ? 'bg-danger/15 text-danger' : 'bg-card text-fg-muted')} aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className={cn('block truncate text-[0.875rem] font-semibold', s.missed && 'text-danger')}>{s.text}</span>
          <span className="block truncate text-[0.75rem] text-fg-muted">
            {clockTime(m.createdAt)}
            {s.detail ? ` · ${s.detail}` : ''}
          </span>
        </span>
        {onCallBack && (
          <button
            type="button"
            onClick={() => onCallBack(s.kind)}
            className="ml-1 shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-[0.8125rem] font-semibold text-accent transition-colors hover:bg-bg-hover active:scale-[0.97]"
            aria-label={s.kind === 'video' ? 'Video call back' : 'Call back'}
          >
            Call back
          </button>
        )}
      </div>
    </div>
  );
}
