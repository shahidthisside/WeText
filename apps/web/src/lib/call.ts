import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { PeerLink, type LinkState, type Signal } from './call-engine';
import { VIDEO_LEVELS, formatDuration, levelForBandwidth, type Quality } from './call-quality';
import { beep, playPattern, unlockAudio, vibrate } from './call-sounds';
import { getSocket } from './socket';
import type { UserSummary } from './types';

/**
 * The call controller: one call at a time per browser tab. It owns the phone line (microphone, camera, the
 * connection to the other person) and a small store the screens read.
 */

export type CallPhase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active' | 'ended';
export type CallKind = 'audio' | 'video';

export type CallPeer = Pick<UserSummary, 'id' | 'username' | 'displayName' | 'avatarUrl'>;

/** What the server sends about a call (see CallView on the server). */
export interface ServerCall {
  callId: string;
  conversationId: string;
  kind: CallKind;
  state: 'ringing' | 'active';
  role: 'caller' | 'callee';
  peer: CallPeer;
  elapsedMs: number | null;
  ringLeftMs: number;
}

export interface RemoteState {
  muted: boolean;
  video: boolean;
  quality: 'good' | 'fair' | 'poor' | null;
  reconnecting: boolean;
  saver: boolean;
}

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  kind: CallKind;
  role: 'caller' | 'callee' | null;
  peer: CallPeer | null;
  muted: boolean;
  cameraOn: boolean;
  canFlip: boolean;
  /** Which camera is in use; the front camera is shown mirrored. */
  facing: 'user' | 'environment';
  /** "Voice only to save data" is on. */
  saver: boolean;
  quality: Quality;
  reconnecting: boolean;
  remote: RemoteState;
  /** Local clock time the call connected. */
  connectedAt: number | null;
  minimized: boolean;
  /** A short message about something that just happened ("Video paused to keep the call clear"). */
  notice: string | null;
  /** Shown on the closing card. */
  endText: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

const REMOTE0: RemoteState = { muted: false, video: false, quality: null, reconnecting: false, saver: false };

const IDLE: CallState = {
  phase: 'idle',
  callId: null,
  conversationId: null,
  kind: 'audio',
  role: null,
  peer: null,
  muted: false,
  cameraOn: false,
  canFlip: false,
  facing: 'user',
  saver: false,
  quality: 'good',
  reconnecting: false,
  remote: REMOTE0,
  connectedAt: null,
  minimized: false,
  notice: null,
  endText: null,
  localStream: null,
  remoteStream: null,
};

let state: CallState = IDLE;
const subs = new Set<() => void>();
function set(patch: Partial<CallState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
export function useCall(): CallState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}
/** For code outside React (and tests). */
export function getCallState() {
  return state;
}

/** Everything that is not shown on screen. */
const rt = {
  token: 0,
  link: null as PeerLink | null,
  local: null as MediaStream | null,
  audioTrack: null as MediaStreamTrack | null,
  cameraTrack: null as MediaStreamTrack | null,
  facing: 'user' as 'user' | 'environment',
  stopRing: null as null | (() => void),
  buzz: null as number | null,
  titleTimer: null as number | null,
  title0: '',
  endTimer: null as number | null,
  noticeTimer: null as number | null,
  wake: null as { release(): Promise<void> } | null,
  sentQuality: null as string | null,
  ice: null as null | { at: number; servers: RTCIceServer[] },
  icePending: null as null | Promise<RTCIceServer[]>,
};

/* ------------------------------------------------------------------ support and errors */

export function callsSupported(): boolean {
  return typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined';
}

class CallError extends Error {}

function mediaMessage(e: unknown, what: 'mic' | 'camera' = 'mic'): string {
  const name = (e as { name?: string })?.name;
  if (e instanceof CallError) return e.message;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return what === 'mic'
      ? 'Allow microphone access in your browser to make calls.'
      : 'Allow camera access in your browser to use video.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return what === 'mic' ? 'No microphone found.' : 'No camera found.';
  if (name === 'NotReadableError' || name === 'AbortError') {
    return what === 'mic' ? 'Your microphone is being used by another app.' : 'Your camera is being used by another app.';
  }
  return 'Could not start the call. Check your microphone and try again.';
}

const SECURE_MSG = 'Calls need a secure (https) connection and an up-to-date browser.';

function videoConstraints(facing: 'user' | 'environment'): MediaTrackConstraints {
  return { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: { ideal: facing } };
}

async function captureCamera(facing: 'user' | 'environment'): Promise<MediaStreamTrack> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CallError(SECURE_MSG);
  const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(facing) });
  const t = s.getVideoTracks()[0]!;
  // Prefer smooth motion to sharp detail: the right trade for a conversation.
  (t as MediaStreamTrack & { contentHint?: string }).contentHint = 'motion';
  return t;
}

/** Microphone (required) and camera (optional: if only the camera fails, the call goes ahead with voice). */
async function acquire(wantVideo: boolean): Promise<{ stream: MediaStream; video: boolean; note: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CallError(SECURE_MSG);
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  let stream: MediaStream;
  let video = wantVideo;
  let note: string | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: wantVideo ? videoConstraints(rt.facing) : false });
  } catch (e) {
    if (!wantVideo) throw new CallError(mediaMessage(e, 'mic'));
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e2) {
      throw new CallError(mediaMessage(e2, 'mic'));
    }
    video = false;
    note = `${mediaMessage(e, 'camera').replace(/\.$/, '')}. Continuing with voice only.`;
  }
  for (const t of stream.getAudioTracks()) (t as MediaStreamTrack & { contentHint?: string }).contentHint = 'speech';
  for (const t of stream.getVideoTracks()) (t as MediaStreamTrack & { contentHint?: string }).contentHint = 'motion';
  return { stream, video, note };
}

/* ------------------------------------------------------------------ connection servers */

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

export function warmIce(): Promise<RTCIceServer[]> {
  if (rt.ice && Date.now() - rt.ice.at < 4 * 60_000) return Promise.resolve(rt.ice.servers);
  if (rt.icePending) return rt.icePending;
  rt.icePending = api
    .get<{ iceServers: RTCIceServer[] }>('/calls/ice')
    .then((r) => {
      rt.ice = { at: Date.now(), servers: r.iceServers };
      return r.iceServers;
    })
    .catch(() => rt.ice?.servers ?? FALLBACK_ICE)
    .finally(() => {
      rt.icePending = null;
    });
  return rt.icePending;
}

/* ------------------------------------------------------------------ socket helpers */

interface Ack {
  ok: boolean;
  code?: string;
  message?: string;
  callId?: string;
  glare?: boolean;
  call?: ServerCall | null;
  elapsedMs?: number;
}

function emitAck(event: string, payload: unknown, timeoutMs = 8000): Promise<Ack> {
  return new Promise((resolve) => {
    const s = getSocket();
    const timer = window.setTimeout(() => resolve({ ok: false, code: 'timeout', message: 'No answer from the server. Check your connection.' }), timeoutMs);
    s.emit(event, payload, (r: Ack) => {
      window.clearTimeout(timer);
      resolve(r ?? { ok: false, code: 'error' });
    });
  });
}

function sendSignal(s: Signal) {
  const callId = state.callId;
  if (!callId) return;
  getSocket().emit('call:signal', { callId, data: s }, (r: Ack) => {
    // The other side hung up while we were still sending: the server tells us in the same breath.
    if (r && !r.ok && r.code === 'gone') endLocal('Call ended');
  });
}

function sendPeer(patch: Record<string, unknown>) {
  if (!state.callId || (state.phase !== 'active' && state.phase !== 'connecting')) return;
  getSocket().emit('call:peer', { callId: state.callId, state: patch }, () => {});
}

/* ------------------------------------------------------------------ the line itself */

function flashNotice(text: string, ms = 5000) {
  if (rt.noticeTimer !== null) window.clearTimeout(rt.noticeTimer);
  set({ notice: text });
  rt.noticeTimer = window.setTimeout(() => set({ notice: null }), ms);
}

function stopRinging() {
  rt.stopRing?.();
  rt.stopRing = null;
  if (rt.buzz !== null) window.clearInterval(rt.buzz);
  rt.buzz = null;
  vibrate(0);
  if (rt.titleTimer !== null) {
    window.clearInterval(rt.titleTimer);
    rt.titleTimer = null;
    document.title = rt.title0;
  }
}

function releaseMedia() {
  for (const t of rt.local?.getTracks() ?? []) t.stop();
  rt.cameraTrack?.stop();
  rt.local = rt.audioTrack = rt.cameraTrack = null;
  void rt.wake?.release().catch(() => {});
  rt.wake = null;
}

async function keepScreenOn() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (rt.wake || !nav.wakeLock) return;
    rt.wake = await nav.wakeLock.request('screen');
  } catch {
    /* not allowed or not supported: the screen may dim, nothing else */
  }
}

/** Closes the line and shows a short closing card (or none). */
function endLocal(text: string | null, sound: 'ended' | 'busy' | null = 'ended') {
  const hadCall = state.phase !== 'idle' && state.phase !== 'ended';
  rt.token++;
  stopRinging();
  rt.link?.close();
  rt.link = null;
  releaseMedia();
  if (rt.noticeTimer !== null) window.clearTimeout(rt.noticeTimer);
  if (!hadCall) return;
  if (sound) beep(sound);
  if (!text) {
    state = IDLE;
    subs.forEach((f) => f());
    return;
  }
  state = { ...IDLE, phase: 'ended', endText: text, peer: state.peer, kind: state.kind, conversationId: state.conversationId, minimized: false };
  subs.forEach((f) => f());
  if (rt.endTimer !== null) window.clearTimeout(rt.endTimer);
  rt.endTimer = window.setTimeout(() => {
    if (state.phase === 'ended') set({ ...IDLE });
  }, 3200);
}

export function dismissEnded() {
  if (state.phase === 'ended') {
    if (rt.endTimer !== null) window.clearTimeout(rt.endTimer);
    set({ ...IDLE });
  }
}

function endTextFor(role: 'caller' | 'callee' | null, reason: string, status: string, durationMs: number, name: string): string | null {
  if (reason === 'answered_elsewhere') return null;
  if (status === 'completed') return durationMs > 0 ? `Call ended · ${formatDuration(durationMs)}` : 'Call ended';
  if (status === 'busy') return `${name} is on another call`;
  if (status === 'declined') return role === 'caller' ? `${name} declined the call` : null;
  if (status === 'missed') return role === 'caller' ? `${name} didn’t answer` : 'Missed call';
  if (status === 'cancelled') return role === 'caller' ? 'Call cancelled' : 'Missed call';
  if (reason === 'blocked') return 'Call ended';
  return 'The connection was lost';
}

function makeLink(polite: boolean) {
  if (!rt.audioTrack) throw new Error('no microphone');
  const link = new PeerLink({
    polite,
    iceServers: rt.ice?.servers ?? FALLBACK_ICE,
    audioTrack: rt.audioTrack,
    cameraTrack: rt.cameraTrack,
    events: {
      signal: sendSignal,
      state: onLinkState,
      firstConnected: onConnected,
      quality: (q, sample) => {
        set({ quality: q });
        const mapped = q === 'bad' ? 'poor' : q;
        if (mapped !== rt.sentQuality && sample.ready) {
          rt.sentQuality = mapped;
          sendPeer({ quality: mapped });
        }
      },
      adapted: (d) => {
        if (d.change === 'stepped-down') flashNotice('Weak connection. Lowering video quality.');
        else if (d.change === 'audio-only') flashNotice('Video paused so the call stays clear.', 7000);
        else if (d.change === 'video-back') flashNotice('Connection improved. Video is back.');
        if (d.change === 'audio-only' || d.change === 'video-back') sendPeer({ audioOnly: d.change === 'audio-only' });
      },
    },
  });
  rt.link = link;
  link.setMuted(state.muted);
  set({ remoteStream: link.remoteStream });
  return link;
}

function onLinkState(s: LinkState) {
  if (s === 'failed') {
    const id = state.callId;
    if (id) getSocket().emit('call:end', { callId: id, reason: 'failed' }, () => {});
    endLocal('The connection was lost');
  } else if (s === 'reconnecting') {
    if (state.phase === 'active' && !state.reconnecting) {
      set({ reconnecting: true });
      sendPeer({ reconnecting: true });
    }
  } else if (s === 'connected') {
    if (state.reconnecting) {
      set({ reconnecting: false });
      sendPeer({ reconnecting: false });
      beep('reconnected');
    }
  }
}

function onConnected() {
  stopRinging();
  beep('connected');
  set({ phase: 'active', connectedAt: Date.now(), reconnecting: false });
  const id = state.callId;
  if (id) getSocket().emit('call:connected', { callId: id }, () => {});
  sendPeer({ muted: state.muted, video: state.cameraOn, saver: state.saver, reconnecting: false });
  if (state.cameraOn || state.kind === 'video') void keepScreenOn();
}

async function startFlip() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter((d) => d.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ making and taking calls */

export interface CallTarget {
  conversationId: string;
  peer: CallPeer;
}

export async function startCall(target: CallTarget, kind: CallKind) {
  if (!callsSupported()) return void toast.error(SECURE_MSG);
  if (state.phase !== 'idle' && state.phase !== 'ended') return void toast('You’re already in a call.');
  if (!navigator.onLine) return void toast.error('You’re offline. Reconnect to call.');
  unlockAudio();
  if (rt.endTimer !== null) window.clearTimeout(rt.endTimer);
  const token = ++rt.token;
  rt.facing = 'user';
  rt.sentQuality = null;
  state = { ...IDLE, phase: 'calling', conversationId: target.conversationId, kind, role: 'caller', peer: target.peer, cameraOn: kind === 'video' };
  subs.forEach((f) => f());
  rt.stopRing = playPattern('ringback');

  try {
    // Permission prompt and server lookup happen together so neither waits for the other.
    const [media] = await Promise.all([acquire(kind === 'video'), warmIce()]);
    if (token !== rt.token) {
      for (const t of media.stream.getTracks()) t.stop();
      return;
    }
    rt.local = media.stream;
    rt.audioTrack = media.stream.getAudioTracks()[0] ?? null;
    rt.cameraTrack = media.video ? (media.stream.getVideoTracks()[0] ?? null) : null;
    const effective: CallKind = media.video ? 'video' : 'audio';
    set({ kind: effective, cameraOn: !!rt.cameraTrack, localStream: media.stream });
    if (media.note) toast(media.note);
    void startFlip().then((can) => token === rt.token && set({ canFlip: can || /Android|iPhone|iPad/i.test(navigator.userAgent) }));

    const ack = await emitAck('call:invite', { conversationId: target.conversationId, kind: effective });
    if (token !== rt.token) {
      // The person cancelled while we were asking the server.
      if (ack.ok && ack.callId) getSocket().emit('call:end', { callId: ack.callId, reason: 'cancel' }, () => {});
      return;
    }
    if (!ack.ok) {
      const busy = ack.code === 'busy';
      if (ack.code !== 'busy') toast.error(ack.message ?? 'Could not place the call.');
      endLocal(busy ? (ack.message ?? 'They are on another call') : null, busy ? 'busy' : null);
      return;
    }
    set({ callId: ack.callId!, conversationId: ack.call?.conversationId ?? target.conversationId });
    if (ack.glare || ack.call?.role === 'callee') {
      // They were calling us at the very same moment: we are now simply answering their call.
      stopRinging();
      set({ role: 'callee', phase: 'connecting' });
      makeLink(true);
    } else {
      makeLink(false); // warm up while it rings
    }
  } catch (e) {
    if (token !== rt.token) return;
    toast.error(mediaMessage(e));
    endLocal(null, null);
  }
}

function showIncoming(c: ServerCall) {
  if (state.phase !== 'idle' && state.phase !== 'ended') return;
  if (rt.endTimer !== null) window.clearTimeout(rt.endTimer);
  rt.token++;
  state = {
    ...IDLE,
    phase: 'incoming',
    callId: c.callId,
    conversationId: c.conversationId,
    kind: c.kind,
    role: 'callee',
    peer: c.peer,
    cameraOn: false,
  };
  subs.forEach((f) => f());
  void warmIce(); // so answering is quick
  rt.stopRing = playPattern('ring');
  vibrate([450, 250, 450]);
  rt.buzz = window.setInterval(() => vibrate([450, 250, 450]), 2600);
  rt.title0 = document.title;
  const label = `📞 ${c.peer.displayName} is calling`;
  let flip = false;
  document.title = label;
  rt.titleTimer = window.setInterval(() => {
    flip = !flip;
    document.title = flip ? rt.title0 : label;
  }, 1000);
}

export async function acceptCall(voiceOnly = false) {
  if (state.phase !== 'incoming' || !state.callId) return;
  unlockAudio();
  const callId = state.callId;
  const wantVideo = state.kind === 'video' && !voiceOnly;
  const token = ++rt.token;
  stopRinging();
  set({ phase: 'connecting', cameraOn: wantVideo, saver: voiceOnly && state.kind === 'video' });
  try {
    const [media] = await Promise.all([acquire(wantVideo), warmIce()]);
    if (token !== rt.token) {
      for (const t of media.stream.getTracks()) t.stop();
      return;
    }
    rt.local = media.stream;
    rt.audioTrack = media.stream.getAudioTracks()[0] ?? null;
    rt.cameraTrack = media.video ? (media.stream.getVideoTracks()[0] ?? null) : null;
    set({ cameraOn: !!rt.cameraTrack, localStream: media.stream });
    if (media.note) toast(media.note);
    void startFlip().then((can) => token === rt.token && set({ canFlip: can || /Android|iPhone|iPad/i.test(navigator.userAgent) }));
    const ack = await emitAck('call:accept', { callId });
    if (token !== rt.token) return;
    if (!ack.ok) {
      toast(ack.message ?? 'This call has ended.');
      endLocal(null, null);
      return;
    }
    makeLink(true);
  } catch (e) {
    if (token !== rt.token) return;
    toast.error(mediaMessage(e));
    getSocket().emit('call:end', { callId, reason: 'decline' }, () => {});
    endLocal(null, null);
  }
}

export function declineCall() {
  const id = state.callId;
  if (state.phase !== 'incoming' || !id) return;
  getSocket().emit('call:end', { callId: id, reason: 'decline' }, () => {});
  endLocal(null, null);
}

export function hangUp() {
  const { phase, callId, connectedAt } = state;
  if (phase === 'incoming') return declineCall();
  if (phase === 'idle' || phase === 'ended') return;
  if (callId) getSocket().emit('call:end', { callId, reason: phase === 'calling' ? 'cancel' : 'hangup' }, () => {});
  endLocal(phase === 'calling' ? 'Call cancelled' : connectedAt ? `Call ended · ${formatDuration(Date.now() - connectedAt)}` : 'Call ended');
}

/* ------------------------------------------------------------------ during the call */

export function toggleMute() {
  const muted = !state.muted;
  rt.link?.setMuted(muted);
  if (rt.audioTrack) rt.audioTrack.enabled = !muted;
  set({ muted });
  sendPeer({ muted });
}

export async function toggleCamera() {
  const link = rt.link;
  if (!link || !rt.local) return;
  if (state.cameraOn) {
    const old = rt.cameraTrack;
    rt.cameraTrack = null;
    set({ cameraOn: false });
    await link.setCamera(null);
    if (old) {
      rt.local.removeTrack(old);
      old.stop();
    }
    sendPeer({ video: false });
    return;
  }
  try {
    const track = await captureCamera(rt.facing);
    if (!rt.link) return void track.stop();
    rt.cameraTrack = track;
    rt.local.addTrack(track);
    // Start at the picture size the network can carry right now instead of crawling up from the smallest.
    const fit = Math.min(VIDEO_LEVELS.length - 1, levelForBandwidth(link.lastSample?.availOutKbps ?? null));
    set({ cameraOn: true, saver: false });
    await link.setCamera(track, fit);
    sendPeer({ video: true, saver: false });
    void keepScreenOn();
  } catch (e) {
    toast.error(mediaMessage(e, 'camera'));
  }
}

export async function flipCamera() {
  const link = rt.link;
  if (!link || !rt.local || !state.cameraOn) return;
  const next = rt.facing === 'user' ? 'environment' : 'user';
  try {
    const track = await captureCamera(next);
    const old = rt.cameraTrack;
    rt.facing = next;
    set({ facing: next });
    rt.cameraTrack = track;
    rt.local.addTrack(track);
    await link.setCamera(track, link.plan.level);
    if (old) {
      rt.local.removeTrack(old);
      old.stop();
    }
  } catch (e) {
    toast.error(mediaMessage(e, 'camera'));
  }
}

/** "Voice only": no video from me, and I ask the other person to pause theirs too. For when data or signal is short. */
export async function toggleSaver() {
  if (state.saver) {
    set({ saver: false });
    sendPeer({ saver: false });
    flashNotice('Video can be turned back on.');
    return;
  }
  set({ saver: true });
  if (state.cameraOn) await toggleCamera();
  sendPeer({ saver: true, video: false });
  flashNotice('Voice only. This saves data.');
}

export function setMinimized(minimized: boolean) {
  set({ minimized });
}

/* ------------------------------------------------------------------ messages from the server */

function onPeer(p: { callId: string; state: Partial<RemoteState & { audioOnly: boolean }> }) {
  if (p.callId !== state.callId) return;
  const next = { ...state.remote };
  const s = p.state;
  if (s.muted !== undefined) next.muted = s.muted;
  if (s.video !== undefined) next.video = s.video;
  if (s.quality !== undefined) next.quality = s.quality;
  if (s.reconnecting !== undefined) next.reconnecting = s.reconnecting;
  if (s.saver !== undefined) next.saver = s.saver;
  if (s.audioOnly) next.video = false;
  const name = state.peer?.displayName ?? 'They';
  if (s.saver === true && !state.remote.saver) {
    set({ remote: next, saver: true });
    if (state.cameraOn) void toggleCamera();
    flashNotice(`${name} switched to voice only to save data.`, 6000);
    return;
  }
  if (s.saver === false && state.remote.saver) flashNotice(`${name} can use video again.`);
  set({ remote: next, ...(s.saver === false ? { saver: false } : {}) });
}

function onSignal(p: { callId: string; data: Signal }) {
  if (p.callId !== state.callId || !rt.link) return;
  void rt.link.handleSignal(p.data);
}

function onAccepted(p: { callId: string }) {
  if (p.callId !== state.callId || state.role !== 'caller') return;
  stopRinging();
  set({ phase: 'connecting' });
  // The link may still be preparing (microphone prompt); start as soon as it exists.
  const go = () => {
    if (rt.link) rt.link.start();
    else if (state.callId === p.callId) window.setTimeout(go, 50);
  };
  go();
}

function onActive(p: { callId: string }) {
  if (p.callId !== state.callId) return;
  // Both sides start the clock from the server's moment, so the two timers agree.
  if (!state.connectedAt) set({ connectedAt: Date.now() });
}

function onEnded(p: { callId: string; reason: string; status: string; durationMs: number }) {
  if (p.callId !== state.callId) return;
  if (p.reason === 'answered_elsewhere') {
    if (state.phase === 'incoming') {
      toast('Answered on another device.');
      endLocal(null, null);
    }
    return;
  }
  const name = state.peer?.displayName ?? 'They';
  const text = endTextFor(state.role, p.reason, p.status, p.durationMs, name);
  endLocal(text, p.status === 'busy' ? 'busy' : text ? 'ended' : null);
}

function reconcile(r: Ack & { elsewhere?: boolean }) {
  const c = r?.call;
  if (c) {
    if ((state.phase === 'idle' || state.phase === 'ended') && c.role === 'callee' && c.state === 'ringing') showIncoming(c);
    return;
  }
  // The server has no call for us. If we think we are in one, it ended while we could not hear about it.
  if (state.callId && state.phase !== 'idle' && state.phase !== 'ended') endLocal('Call ended');
}

function sync() {
  getSocket().emit('call:sync', {}, (r: Ack) => r && reconcile(r));
}

/** Mounted once, in the app layout. */
export function useCallSignalling(meId: string | undefined) {
  useEffect(() => {
    if (!meId || !callsSupported()) return;
    const s = getSocket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: [string, (...a: any[]) => void][] = [
      ['call:incoming', showIncoming],
      ['call:accepted', onAccepted],
      ['call:signal', onSignal],
      ['call:active', onActive],
      ['call:peer', onPeer],
      ['call:ended', onEnded],
      ['connect', sync],
    ];
    for (const [ev, fn] of handlers) s.on(ev, fn);
    if (s.connected) sync();

    const online = () => rt.link?.nudge();
    const before = (e: BeforeUnloadEvent) => {
      if (state.phase === 'connecting' || state.phase === 'active' || state.phase === 'calling') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const leaving = () => {
      const id = state.callId;
      if (id && (state.phase === 'active' || state.phase === 'connecting' || state.phase === 'calling')) {
        s.emit('call:end', { callId: id, reason: state.phase === 'calling' ? 'cancel' : 'hangup' });
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible' && state.phase === 'active' && (state.cameraOn || state.remote.video)) void keepScreenOn();
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', before);
    window.addEventListener('pagehide', leaving);
    document.addEventListener('visibilitychange', visible);
    return () => {
      for (const [ev, fn] of handlers) s.off(ev, fn);
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('pagehide', leaving);
      document.removeEventListener('visibilitychange', visible);
      // Signing out or leaving the app hangs up.
      if (state.phase !== 'idle') {
        if (state.callId) s.emit('call:end', { callId: state.callId, reason: state.phase === 'incoming' ? 'decline' : state.phase === 'calling' ? 'cancel' : 'hangup' });
        endLocal(null, null);
      }
    };
  }, [meId]);
}
