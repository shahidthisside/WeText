export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time: "now", "5m", "3h", "Mar 4", "Mar 4, 2024". */
export function shortTime(ts: number, now = Date.now()) {
  const d = now - ts;
  if (d < MIN) return 'now';
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function fullTime(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export function clockTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - DAY);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}

export function lastSeen(ts: number | null | undefined) {
  if (!ts) return null;
  const d = Date.now() - ts;
  if (d < 2 * MIN) return 'Active just now';
  if (d < HOUR) return `Active ${Math.floor(d / MIN)}m ago`;
  if (d < DAY) return `Active ${Math.floor(d / HOUR)}h ago`;
  if (d < 7 * DAY) return `Active ${Math.floor(d / DAY)}d ago`;
  return null;
}

export function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${compact(n)} ${n === 1 ? one : many}`;
}

export function timeLeft(endsAt: number) {
  const d = endsAt - Date.now();
  if (d <= 0) return 'Final results';
  if (d < HOUR) return `${Math.ceil(d / MIN)} minutes left`;
  if (d < DAY) return `${Math.ceil(d / HOUR)} hours left`;
  return `${Math.ceil(d / DAY)} days left`;
}
