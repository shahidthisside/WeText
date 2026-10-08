import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/** Only one audio bubble may play at a time across the whole thread. */
const playing = { current: null as HTMLAudioElement | null };

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** A deterministic "waveform" so the same message always looks the same. */
function bars(seed: string, n = 28): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    out.push(0.25 + ((h % 1000) / 1000) * 0.75);
  }
  return out;
}

const SPEEDS = [1, 1.5, 2] as const;

export function AudioBubble({ url, durationMs, mine, seed }: { url: string; durationMs: number; mine: boolean; seed: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0); // 0..1
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const wave = useMemo(() => bars(seed), [seed]);
  const id = useId();
  const total = durationMs || 1;

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => {
      const d = el.duration && Number.isFinite(el.duration) ? el.duration : total / 1000;
      setPos(d ? el.currentTime / d : 0);
    };
    const onEnd = () => {
      setIsPlaying(false);
      setPos(0);
      if (playing.current === el) playing.current = null;
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('pause', () => setIsPlaying(false));
    el.addEventListener('play', () => setIsPlaying(true));
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [total]);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      if (playing.current && playing.current !== el) playing.current.pause();
      playing.current = el;
      el.playbackRate = speed;
      void el.play().catch(() => setIsPlaying(false));
    } else {
      el.pause();
    }
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  const elapsed = isPlaying || pos > 0 ? pos * total : total;

  return (
    <div className={cn('flex items-center gap-2.5 px-3 py-2.5', mine ? 'text-on-accent' : 'text-fg')}>
      <audio ref={audio} src={url} preload="none" aria-label="Voice message" />
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95',
          mine ? 'bg-on-accent/20 text-on-accent' : 'bg-accent text-on-accent',
        )}
      >
        {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
      </button>
      <div className="flex min-w-[120px] flex-1 flex-col gap-1">
        <div className="flex h-7 items-end gap-[2px]" aria-hidden>
          {wave.map((v, i) => {
            const played = i / wave.length <= pos;
            return (
              <span
                key={`${id}-${i}`}
                className={cn(
                  'w-[3px] rounded-full transition-colors',
                  played ? (mine ? 'bg-on-accent' : 'bg-accent') : mine ? 'bg-on-accent/35' : 'bg-fg-muted/35',
                )}
                style={{ height: `${Math.round(v * 100)}%` }}
              />
            );
          })}
        </div>
        <span className={cn('text-[0.75rem] tabular-nums', mine ? 'text-on-accent/80' : 'text-fg-muted')}>{fmt(elapsed)}</span>
      </div>
      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Playback speed ${speed}×`}
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-bold tabular-nums transition-colors',
          mine ? 'bg-on-accent/20 text-on-accent' : 'bg-bg text-fg-muted',
        )}
      >
        {speed}×
      </button>
    </div>
  );
}
