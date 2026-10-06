import { useQuery } from '@tanstack/react-query';
import { Check, PartyPopper, X } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAuthedMe } from '../lib/auth';
import { openComposer } from '../lib/composer';
import { setFlag, useFlag } from '../lib/flags';
import type { DailyPrompt } from '../lib/types';
import { cn } from '../lib/utils';

export const GETTING_STARTED_DISMISSED = 'getting-started-dismissed';

interface Step {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  to?: string;
  onClick?: () => void;
  cta: string;
}

/** A short, dismissible checklist for new people. Progress is detected automatically. */
export function GettingStarted() {
  const me = useAuthedMe();
  const dismissed = useFlag(GETTING_STARTED_DISMISSED);
  const visitedConnect = useFlag('visited-connect');
  const prompt = useQuery({ queryKey: ['prompt'], queryFn: () => api.get<{ prompt: DailyPrompt }>('/feed/prompt'), staleTime: 60_000 });
  if (dismissed) return null;

  const steps: Step[] = [
    { key: 'profile', label: 'Add a photo and bio', hint: 'So people know who they’re talking to', done: !!me.avatarUrl && !!me.bio, to: `/${me.username}`, cta: 'Edit profile' },
    { key: 'note', label: 'Write your first note', hint: 'Anything on your mind, 500 characters', done: me.postsCount > 0, onClick: () => openComposer(), cta: 'Write' },
    { key: 'prompt', label: 'Answer today’s prompt', hint: 'One question a day, everyone answers', done: !!prompt.data?.prompt.answered, onClick: () => prompt.data && openComposer({ prompt: { key: prompt.data.prompt.key, text: prompt.data.prompt.text } }), cta: 'Answer' },
    { key: 'follow', label: 'Follow 3 people', hint: 'Their notes land in your Following feed', done: me.followingCount >= 3, to: '/connect', cta: 'Find people' },
    { key: 'connect', label: 'Try Connect', hint: 'See who matches your interests and vibe', done: visitedConnect, to: '/connect', cta: 'Open' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const all = doneCount === steps.length;
  const next = steps.find((s) => !s.done);
  const close = () => setFlag(GETTING_STARTED_DISMISSED, true);

  return (
    <section className="relative rounded-[22px] border border-line bg-card p-5 shadow-paper" aria-label="Getting started">
      <button onClick={close} aria-label="Dismiss getting started" title="Dismiss" className="absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bg-hover hover:text-fg">
        <X className="size-4" />
      </button>
      {all ? (
        <div className="flex items-start gap-3 pr-8">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <PartyPopper className="size-5" />
          </span>
          <div>
            <p className="font-display text-[1.125rem] font-bold">You’re all set.</p>
            <p className="mt-0.5 text-[0.875rem] text-fg-muted">You’ve done the basics. Press <kbd className="rounded border border-line bg-bg-muted px-1 text-[0.75rem]">⌘K</kbd> any time to jump around.</p>
            <button onClick={close} className="mt-3 text-[0.875rem] font-semibold text-accent hover:underline">
              Close this
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-accent">Getting started</p>
          <div className="mt-1 flex items-center gap-3 pr-8">
            <h2 className="font-display text-[1.25rem] font-bold leading-tight">
              {doneCount} of {steps.length} done
            </h2>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length}>
              <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
          </div>
          <ul className="mt-3 space-y-0.5">
            {steps.map((s) => {
              const isNext = s === next;
              const body = (
                <>
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors', s.done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong')}>
                    {s.done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-[0.9375rem] font-medium', s.done && 'text-fg-subtle line-through')}>{s.label}</span>
                    {isNext && <span className="block text-[0.75rem] text-fg-muted">{s.hint}</span>}
                  </span>
                  {isNext && <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-[0.75rem] font-semibold text-on-accent">{s.cta}</span>}
                </>
              );
              const cls = cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors', !s.done && 'hover:bg-bg-hover');
              return (
                <li key={s.key}>
                  {s.done ? (
                    <div className={cls}>{body}</div>
                  ) : s.to ? (
                    <Link to={s.to} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <button onClick={s.onClick} className={cls}>
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
