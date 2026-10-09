/**
 * Call sounds made with the Web Audio API, so there are no sound files to download.
 *
 * Browsers only allow sound after the person has touched the page once. `unlockAudio()` is wired to the first tap or
 * key press; if a call rings before that, the ring is silent and the screen, the vibration and the tab title still
 * announce it.
 */

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

/** One soft tone (or two mixed) with a short fade in and out so it never clicks. */
function tone(c: AudioContext, at: number, seconds: number, freqs: number[], volume: number) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.03);
  gain.gain.setValueAtTime(volume, at + Math.max(0.03, seconds - 0.05));
  gain.gain.linearRampToValueAtTime(0, at + seconds);
  gain.connect(c.destination);
  for (const f of freqs) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(gain);
    o.start(at);
    o.stop(at + seconds + 0.05);
  }
}

export type Pattern = 'ring' | 'ringback';

/** Repeats a pattern until the returned function is called. */
export function playPattern(kind: Pattern): () => void {
  const c = context();
  if (!c) return () => {};
  let stopped = false;
  const cycle = () => {
    if (stopped) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    const t = c.currentTime + 0.05;
    if (kind === 'ring') {
      // a double ring, like a phone: ring-ring ... pause
      tone(c, t, 0.4, [440, 480], 0.12);
      tone(c, t + 0.55, 0.4, [440, 480], 0.12);
    } else {
      // the "calling..." tone the caller hears
      tone(c, t, 1.0, [425], 0.06);
    }
  };
  cycle();
  const timer = window.setInterval(cycle, kind === 'ring' ? 2600 : 3600);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

export type Beep = 'connected' | 'ended' | 'busy' | 'reconnected';

export function beep(kind: Beep) {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  switch (kind) {
    case 'connected':
      tone(c, t, 0.12, [660], 0.09);
      tone(c, t + 0.14, 0.18, [880], 0.09);
      break;
    case 'reconnected':
      tone(c, t, 0.1, [740], 0.07);
      break;
    case 'ended':
      tone(c, t, 0.16, [520], 0.09);
      tone(c, t + 0.2, 0.2, [390], 0.09);
      break;
    case 'busy':
      for (let i = 0; i < 3; i++) tone(c, t + i * 0.45, 0.25, [480, 620], 0.08);
      break;
  }
}

/** A buzz on phones that support it. */
export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
