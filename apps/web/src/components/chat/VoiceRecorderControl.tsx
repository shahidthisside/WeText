import { Lock, Mic, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_RECORDING_MS, VoiceRecorder, isRecordingSupported, type RecorderError } from '../../lib/chat-audio';
import { haptic } from '../../lib/chat';
import { cn } from '../../lib/utils';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Phase = 'idle' | 'recording';

/**
 * Press-and-hold or tap-to-record. On release (or when "locked") the recording
 * is finalised and handed back via `onComplete`. Cancel discards it.
 */
export function VoiceRecorderControl({
  onComplete,
  onRecordingChange,
  disabled,
}: {
  onComplete: (blob: Blob, durationMs: number) => void;
  onRecordingChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<VoiceRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => stopTimer(), []);
  useEffect(() => onRecordingChange(phase === 'recording'), [phase, onRecordingChange]);

  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  async function begin() {
    if (phase !== 'idle' || disabled) return;
    if (!isRecordingSupported()) {
      toast.error('Voice messages aren’t supported in this browser');
      return;
    }
    const r = new VoiceRecorder();
    cancelled.current = false;
    try {
      await r.start();
    } catch (e) {
      const err = e as RecorderError;
      toast.error(
        err === 'denied' ? 'Microphone access was denied' : err === 'unsupported' ? 'Voice messages aren’t supported here' : 'Couldn’t start recording',
      );
      return;
    }
    rec.current = r;
    haptic(15);
    setPhase('recording');
    setElapsed(0);
    timer.current = setInterval(() => {
      const ms = Date.now() - r.startedAt;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) finish();
    }, 100);
  }

  async function finish() {
    stopTimer();
    const r = rec.current;
    if (!r) {
      reset();
      return;
    }
    const dur = Date.now() - r.startedAt;
    const blob = await r.stop();
    rec.current = null;
    reset();
    if (cancelled.current) return;
    if (!blob || dur < 500) {
      toast('Hold to record a longer message');
      return;
    }
    onComplete(blob, Math.min(dur, MAX_RECORDING_MS));
  }

  function cancel() {
    cancelled.current = true;
    stopTimer();
    rec.current?.cancel();
    rec.current = null;
    reset();
  }

  function reset() {
    setPhase('idle');
    setLocked(false);
    setElapsed(0);
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        aria-label="Record voice message"
        disabled={disabled}
        onClick={() => begin()}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
      >
        <Mic className="size-5" />
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-3 px-1" role="group" aria-label="Recording voice message">
      <button
        type="button"
        aria-label="Cancel recording"
        onClick={cancel}
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-danger transition-colors hover:bg-bg-hover"
      >
        <Trash2 className="size-5" />
      </button>
      <span className="flex items-center gap-2 text-[0.9375rem] font-semibold text-danger">
        <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
        <span className="tabular-nums" aria-live="polite">
          {fmt(elapsed)}
        </span>
      </span>
      <span className="flex-1 text-[0.8125rem] text-fg-muted">{locked ? 'Hands-free' : 'Recording…'}</span>
      {!locked && (
        <button
          type="button"
          aria-label="Lock recording hands-free"
          onClick={() => {
            setLocked(true);
            haptic();
          }}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-hover"
        >
          <Lock className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="Send voice message"
        onClick={finish}
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-transform active:scale-95')}
      >
        <Send className="size-5" />
      </button>
    </div>
  );
}
