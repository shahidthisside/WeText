import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Vibe } from '../lib/types';
import { cn } from '../lib/utils';
import { Spinner } from './ui';

export function ScoreRing({ score, size = 72, className }: { score: number; size?: number; className?: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('relative shrink-0 rounded-full bg-card', className)} style={{ width: size, height: size }} aria-label={`${score}% match`}>
      <svg viewBox="0 0 52 52" className="size-full -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--wt-line)" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--wt-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-1000" />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display font-extrabold tabular-nums" style={{ fontSize: size * 0.28 }}>
          {score}
        </span>
        <span className="font-semibold uppercase tracking-wider text-fg-subtle" style={{ fontSize: size * 0.11 }}>
          match
        </span>
      </span>
    </div>
  );
}

/** One row per personality trait: how closely you line up, without revealing anyone's actual slider. */
export function VibeBars({ traits, twoCol }: { traits: Vibe['traits']; twoCol?: boolean }) {
  return (
    <ul className={twoCol ? 'grid gap-x-6 gap-y-3 sm:grid-cols-2' : 'space-y-3.5'}>
      {traits.map((t) => (
        <li key={t.key}>
          <div className="mb-1 flex items-center justify-between text-[0.75rem] text-fg-muted">
            <span className={cn(t.lean === 'low' && 'font-bold text-fg')}>{t.low}</span>
            <span className={cn(t.lean === 'high' && 'font-bold text-fg')}>{t.high}</span>
          </div>
          <div className="relative h-2 rounded-full bg-bg-muted" role="img" aria-label={`${t.closeness}% in sync on ${t.low} to ${t.high}`}>
            {/* the filled "sync" window grows from the centre with closeness */}
            <div
              className="absolute inset-y-0 rounded-full bg-accent transition-all duration-700"
              style={{
                width: `${Math.max(8, t.closeness)}%`,
                left: t.lean === 'low' ? '0%' : t.lean === 'high' ? undefined : `${(100 - Math.max(8, t.closeness)) / 2}%`,
                right: t.lean === 'high' ? '0%' : undefined,
                opacity: 0.35 + (t.closeness / 100) * 0.65,
              }}
            />
          </div>
          <p className="mt-0.5 text-right text-[0.6875rem] font-semibold text-fg-subtle">{t.closeness}% in sync</p>
        </li>
      ))}
    </ul>
  );
}

export function VibeCheck({ username, name }: { username: string; name: string }) {
  const q = useQuery({ queryKey: ['vibe', username], queryFn: () => api.get<{ vibe: Vibe | null }>(`/users/${username}/vibe`) });
  if (q.isPending)
    return (
      <div className="flex justify-center rounded-[var(--radius-card)] border border-line bg-card p-8 text-accent">
        <Spinner />
      </div>
    );
  const v = q.data?.vibe;
  if (!v) return null;
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-card p-5 shadow-paper">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-accent">Vibe check</p>
      <div className="mt-3 flex items-center gap-4">
        <ScoreRing score={v.score} />
        <p className="font-display text-[1.25rem] font-bold leading-tight">
          You and {name.split(' ')[0]} {v.score >= 75 ? 'really click.' : v.score >= 50 ? 'have a lot in common.' : v.score >= 30 ? 'overlap in places.' : 'are quite different.'}
        </p>
      </div>
      {v.sharedInterests.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[0.75rem] font-semibold text-fg-muted">You both like</p>
          <div className="flex flex-wrap gap-1.5">
            {v.sharedInterests.map((i) => (
              <span key={i} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.8125rem] font-semibold text-accent">
                {i}
              </span>
            ))}
          </div>
        </div>
      )}
      {v.highlights.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {v.highlights.map((h) => (
            <span key={h} className="rounded-full bg-bg-muted px-2.5 py-0.5 text-[0.8125rem] font-semibold text-fg-muted">
              {h}
            </span>
          ))}
        </div>
      )}
      {v.traits.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <VibeBars traits={v.traits} />
        </div>
      )}
    </section>
  );
}
