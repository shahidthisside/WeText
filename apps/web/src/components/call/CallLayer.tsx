import {
  ChevronDown,
  Gauge,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SwitchCamera,
  Video,
  VideoOff,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  acceptCall,
  declineCall,
  dismissEnded,
  flipCamera,
  hangUp,
  setMinimized,
  toggleCamera,
  toggleMute,
  toggleSaver,
  useCall,
  type CallState,
} from '../../lib/call';
import { formatDuration, qualityLabel } from '../../lib/call-quality';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui';

/** Re-renders every second while `on`, so the call timer moves. */
function useTick(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setN((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [on]);
}

/** The words under the person's name. */
function statusLine(c: CallState, now: number): { text: string; tone: 'normal' | 'warn' } {
  const name = c.peer?.displayName ?? 'They';
  if (c.phase === 'calling') return { text: 'Calling…', tone: 'normal' };
  if (c.phase === 'connecting') return { text: 'Connecting…', tone: 'normal' };
  if (c.reconnecting) return { text: 'Reconnecting…', tone: 'warn' };
  if (c.remote.reconnecting) return { text: `${name} is reconnecting…`, tone: 'warn' };
  return { text: c.connectedAt ? formatDuration(now - c.connectedAt) : 'Connected', tone: 'normal' };
}

function SignalBadge({ c }: { c: CallState }) {
  if (c.phase !== 'active') return null;
  const q = c.reconnecting ? 'bad' : c.quality;
  const Icon = q === 'good' ? SignalHigh : q === 'fair' ? SignalMedium : q === 'poor' ? SignalLow : WifiOff;
  const label = c.reconnecting ? 'Reconnecting' : qualityLabel(c.quality);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[0.75rem] font-semibold',
        q === 'good' && 'text-emerald-300',
        q === 'fair' && 'text-amber-200',
        (q === 'poor' || q === 'bad') && 'text-orange-300',
      )}
      role="status"
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" aria-hidden />
      <span className={cn(q === 'good' || q === 'fair' ? 'hidden sm:inline' : 'inline')}>{label}</span>
    </span>
  );
}

function RoundButton({
  label,
  onClick,
  children,
  active,
  danger,
  big,
  disabled,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  /** Highlighted: the setting is on (for example, muted). */
  active?: boolean;
  danger?: boolean;
  big?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          'grid place-items-center rounded-full outline-none transition-[transform,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-white active:scale-90 disabled:opacity-40',
          big ? 'size-[68px]' : 'size-14',
          danger ? 'bg-danger text-white hover:brightness-110' : active ? 'bg-white text-neutral-900' : 'bg-white/15 text-white hover:bg-white/25',
        )}
      >
        {children}
      </button>
      <span className="text-[0.6875rem] font-medium text-white/80" aria-hidden>
        {label}
      </span>
    </div>
  );
}

/** Plays the other person's sound and picture. It stays mounted for the whole call, even when the call is minimised. */
function RemoteMedia({
  stream,
  visible,
  videoRef,
  onBlocked,
}: {
  stream: MediaStream | null;
  visible: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The browser refused to start sound until the person taps (it happens on some phones). */
  onBlocked: (blocked: boolean) => void;
}) {
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) el.play().then(() => onBlocked(false)).catch(() => onBlocked(true));
  }, [stream, videoRef, onBlocked]);
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      aria-hidden
      onLoadedMetadata={() => videoRef.current?.play().then(() => onBlocked(false)).catch(() => onBlocked(true))}
      className={cn(visible ? 'absolute inset-0 size-full object-cover' : 'pointer-events-none absolute size-px opacity-0')}
    />
  );
}

function LocalPreview({ stream, mirror }: { stream: MediaStream | null; mirror: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Your camera"
      className={cn('size-full object-cover', mirror && '-scale-x-100')}
    />
  );
}

/* ------------------------------------------------------------------ incoming */

function Incoming({ c }: { c: CallState }) {
  const accept = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    accept.current?.focus();
  }, []);
  const video = c.kind === 'video';
  const name = c.peer?.displayName ?? 'Someone';
  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Incoming ${video ? 'video' : 'voice'} call from ${name}`}
        className="flex w-full flex-col items-center bg-neutral-950 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] text-white sm:max-w-sm sm:rounded-3xl sm:py-10 sm:shadow-2xl"
      >
        <p className="text-[0.8125rem] font-semibold uppercase tracking-widest text-white/60">Incoming {video ? 'video' : 'voice'} call</p>
        <div className="relative mt-10 sm:mt-8">
          <span className="absolute inset-0 -m-3 rounded-full bg-white/10 motion-safe:animate-ping" aria-hidden />
          <Avatar user={c.peer} size={128} />
        </div>
        <h2 className="mt-6 max-w-full truncate font-display text-[1.75rem] font-bold">{name}</h2>
        <p className="text-[0.9375rem] text-white/60">@{c.peer?.username}</p>

        <div className="mt-auto flex w-full max-w-xs items-start justify-around pt-16 sm:mt-10 sm:pt-0">
          <RoundButton label="Decline" onClick={declineCall} danger big>
            <PhoneOff className="size-7" />
          </RoundButton>
          <div className="flex flex-col items-center gap-1.5">
            <button
              ref={accept}
              type="button"
              onClick={() => void acceptCall(false)}
              aria-label={video ? 'Accept video call' : 'Accept call'}
              className="grid size-[68px] place-items-center rounded-full bg-emerald-500 text-white outline-none transition-transform duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white active:scale-90"
            >
              {video ? <Video className="size-7" /> : <Phone className="size-7" />}
            </button>
            <span className="text-[0.6875rem] font-medium text-white/80" aria-hidden>
              Accept
            </span>
          </div>
        </div>
        {video && (
          <button
            type="button"
            onClick={() => void acceptCall(true)}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-[0.875rem] font-semibold text-white/90 transition-colors hover:bg-white/10"
          >
            <Gauge className="size-4" aria-hidden /> Answer with voice only
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the call itself */

function InCall({ c, soundBlocked, enableSound }: { c: CallState; soundBlocked: boolean; enableSound: () => void }) {
  useTick(c.phase === 'active');
  const name = c.peer?.displayName ?? 'Call';
  const status = statusLine(c, Date.now());
  const showRemoteVideo = c.remote.video && !c.remote.saver && c.phase === 'active';
  const warnRemote = c.phase === 'active' && c.remote.quality && c.remote.quality !== 'good' && !c.remote.reconnecting ? `${name}’s connection is weak` : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMinimized(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${c.kind === 'video' ? 'Video' : 'Voice'} call with ${name}`}
      className={cn('fixed inset-0 z-[100] overflow-hidden text-white', !showRemoteVideo && 'bg-neutral-950')}
    >
      {soundBlocked && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-5 py-3 text-[0.9375rem] font-bold text-neutral-900 shadow-lg"
        >
          Tap to turn on sound
        </button>
      )}
      {/* Background when there is no picture: a soft blur of the person's colours. */}
      {!showRemoteVideo && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_50%_35%,#2b2623_0%,#0c0b0a_70%)]">
          <div className="-mt-24 flex flex-col items-center px-6 text-center">
            <Avatar user={c.peer} size={112} />
            {c.remote.muted && c.phase === 'active' && (
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[0.75rem] font-semibold">
                <MicOff className="size-3.5" aria-hidden /> {name} is muted
              </span>
            )}
            {c.remote.saver && (
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[0.75rem] font-semibold">
                <Gauge className="size-3.5" aria-hidden /> Voice only
              </span>
            )}
          </div>
        </div>
      )}
      {/* A little shade top and bottom keeps the text readable over video. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />

      <header className="absolute inset-x-0 top-0 flex items-start gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label="Minimise call"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/12 outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
        >
          <ChevronDown className="size-6" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5 text-center">
          <h2 className="truncate font-display text-[1.0625rem] font-bold">{name}</h2>
          <p className={cn('text-[0.875rem] tabular-nums', status.tone === 'warn' ? 'text-amber-300' : 'text-white/75')} aria-live="polite">
            {status.text}
          </p>
        </div>
        <div className="flex min-h-11 shrink-0 items-center">
          <SignalBadge c={c} />
        </div>
      </header>

      {/* What just happened: "Weak connection. Lowering video quality." */}
      <div className="pointer-events-none absolute inset-x-0 top-[max(5rem,calc(env(safe-area-inset-top)+4.25rem))] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {c.notice && <p className="max-w-sm rounded-full bg-black/60 px-4 py-2 text-center text-[0.8125rem] font-medium backdrop-blur">{c.notice}</p>}
        {!c.notice && warnRemote && <p className="rounded-full bg-black/60 px-4 py-2 text-center text-[0.8125rem] font-medium backdrop-blur">{warnRemote}</p>}
      </div>

      {c.cameraOn && c.localStream && (
        <div className="absolute bottom-[max(9.5rem,calc(env(safe-area-inset-bottom)+8.5rem))] right-3 aspect-[3/4] w-[26vw] max-w-[132px] min-w-[84px] overflow-hidden rounded-2xl border-2 border-white/30 bg-neutral-800 shadow-xl sm:right-5">
          <LocalPreview stream={c.localStream} mirror={c.facing === 'user'} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md items-start justify-center gap-3 min-[380px]:gap-4">
          <RoundButton label={c.muted ? 'Unmute' : 'Mute'} onClick={toggleMute} active={c.muted} pressed={c.muted}>
            {c.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </RoundButton>
          <RoundButton label={c.cameraOn ? 'Camera off' : 'Camera on'} onClick={() => void toggleCamera()} active={!c.cameraOn} pressed={c.cameraOn} disabled={c.phase !== 'active'}>
            {c.cameraOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
          </RoundButton>
          {c.cameraOn && c.canFlip && (
            <RoundButton label="Flip" onClick={() => void flipCamera()}>
              <SwitchCamera className="size-6" />
            </RoundButton>
          )}
          <RoundButton label="Save data" onClick={() => void toggleSaver()} active={c.saver} pressed={c.saver} disabled={c.phase !== 'active'}>
            <Gauge className="size-6" />
          </RoundButton>
          <RoundButton label={c.phase === 'calling' ? 'Cancel' : 'End'} onClick={hangUp} danger>
            <PhoneOff className="size-6" />
          </RoundButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ minimised */

function MiniBar({ c }: { c: CallState }) {
  useTick(c.phase === 'active');
  const status = statusLine(c, Date.now());
  const name = c.peer?.displayName ?? 'Call';
  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md items-center gap-1 rounded-full bg-neutral-900 py-1.5 pl-1.5 pr-1.5 text-white shadow-xl ring-1 ring-white/10">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label={`Return to call with ${name}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-0.5 pl-0.5 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Avatar user={c.peer} size={36} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.875rem] font-bold">{name}</span>
            <span className={cn('block text-[0.75rem] tabular-nums', status.tone === 'warn' ? 'text-amber-300' : 'text-emerald-300')}>{status.text}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={c.muted ? 'Unmute' : 'Mute'}
          aria-pressed={c.muted}
          className={cn('grid size-10 shrink-0 place-items-center rounded-full transition-colors', c.muted ? 'bg-white text-neutral-900' : 'bg-white/12 hover:bg-white/20')}
        >
          {c.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </button>
        <button type="button" onClick={hangUp} aria-label="End call" className="grid size-10 shrink-0 place-items-center rounded-full bg-danger text-white hover:brightness-110">
          <PhoneOff className="size-5" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ closing card */

function EndedCard({ c }: { c: CallState }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={dismissEnded}
        role="status"
        className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-neutral-900 py-2 pl-2 pr-5 text-left text-white shadow-xl ring-1 ring-white/10 motion-safe:animate-rise"
      >
        <Avatar user={c.peer} size={36} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[0.875rem] font-bold">{c.peer?.displayName}</span>
          <span className="block truncate text-[0.8125rem] text-white/70">{c.endText}</span>
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ root */

/** Mounted once in the app layout. Shows whichever call screen fits the moment, over everything else. */
export function CallLayer() {
  const c = useCall();
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  if (c.phase === 'idle') return null;
  const live = c.phase === 'calling' || c.phase === 'connecting' || c.phase === 'active';
  const full = live && !c.minimized;
  const picture = full && c.remote.video && !c.remote.saver && c.phase === 'active';
  return createPortal(
    <>
      {/* Sound and picture keep playing while the call is minimised. */}
      {live && (
        <div className={cn('pointer-events-none', full ? 'fixed inset-0 z-[99] overflow-hidden' : 'fixed size-px overflow-hidden opacity-0')} aria-hidden>
          <RemoteMedia stream={c.remoteStream} visible={picture} videoRef={video} onBlocked={setBlocked} />
        </div>
      )}
      {c.phase === 'incoming' && <Incoming c={c} />}
      {full && (
        <InCall
          c={c}
          soundBlocked={blocked}
          enableSound={() => {
            void video.current?.play().then(() => setBlocked(false)).catch(() => {});
          }}
        />
      )}
      {live && c.minimized && <MiniBar c={c} />}
      {c.phase === 'ended' && c.endText && <EndedCard c={c} />}
    </>,
    document.body,
  );
}
