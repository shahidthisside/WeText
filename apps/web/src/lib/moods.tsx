/** Client copy of the server's mood catalog (kept in sync with /api/meta). */
export const MOODS = [
  { key: 'glow', label: 'Glowing', emoji: '✨', color: 'var(--color-mood-glow)' },
  { key: 'calm', label: 'Calm', emoji: '🌿', color: 'var(--color-mood-calm)' },
  { key: 'curious', label: 'Curious', emoji: '🔍', color: 'var(--color-mood-curious)' },
  { key: 'fired', label: 'Fired up', emoji: '🔥', color: 'var(--color-mood-fired)' },
  { key: 'tender', label: 'Tender', emoji: '🫶', color: 'var(--color-mood-tender)' },
  { key: 'heavy', label: 'Heavy', emoji: '🌧️', color: 'var(--color-mood-heavy)' },
  { key: 'silly', label: 'Silly', emoji: '🙃', color: 'var(--color-mood-silly)' },
  { key: 'tired', label: 'Tired', emoji: '🌙', color: 'var(--color-mood-tired)' },
] as const;

export type MoodKey = (typeof MOODS)[number]['key'];

export function moodOf(key: string | null | undefined) {
  return MOODS.find((m) => m.key === key) ?? null;
}

export function MoodChip({ mood, onDark, size = 'sm' }: { mood: string | null | undefined; onDark?: boolean; size?: 'sm' | 'md' }) {
  const m = moodOf(mood);
  if (!m) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ${size === 'sm' ? 'h-6 px-2 text-[0.75rem]' : 'h-8 px-3 text-[0.8125rem]'}`}
      style={{
        background: `color-mix(in srgb, ${m.color} ${onDark ? 26 : 16}%, transparent)`,
        color: onDark ? 'var(--wt-on-whisper)' : `color-mix(in srgb, ${m.color} 70%, var(--wt-ink))`,
      }}
    >
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}
