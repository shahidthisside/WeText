import {
  AUDIO_KBPS,
  Adapter,
  StatsTracker,
  VIDEO_LEVELS,
  startLevel,
  tuneOpus,
  type Decision,
  type Plan,
  type Quality,
  type StatSample,
} from './call-quality';

/**
 * One WebRTC connection between two phones.
 *
 * - Negotiation follows the "perfect negotiation" rules: both sides can offer at any time (to restart a dead
 *   connection, say) and if two offers cross, the callee ("polite") backs off, so the two never get stuck.
 * - The connection is watched. If it drops, it is repaired by restarting the ICE search, repeatedly, for up to
 *   `GIVE_UP_MS`, and the network coming back is noticed straight away.
 * - Every two seconds the connection is measured and the amount of video sent is adjusted (see call-quality.ts).
 *   The voice always has priority over the picture.
 */

export type Signal =
  | { type: 'description'; description: { type: RTCSdpType; sdp?: string } }
  | { type: 'candidate'; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } | null };

export type LinkState = 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface LinkEvents {
  /** Send this to the other phone (through the server). */
  signal(s: Signal): void;
  state(state: LinkState): void;
  /** The very first time sound can flow. */
  firstConnected(): void;
  quality(q: Quality, sample: StatSample): void;
  /** The amount of video being sent changed. */
  adapted(d: Decision): void;
}

export interface LinkOptions {
  polite: boolean;
  iceServers: RTCIceServer[];
  audioTrack: MediaStreamTrack;
  cameraTrack: MediaStreamTrack | null;
  events: LinkEvents;
}

/** First connection must happen within this long after answering. */
const CONNECT_MS = 30_000;
/** A connection that was working gets this long to recover before the call is given up. */
const GIVE_UP_MS = 40_000;
const STATS_EVERY_MS = 2_000;

type Stat = Record<string, unknown> & { type: string };

export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly remoteStream = new MediaStream();
  lastSample: StatSample | null = null;

  private readonly polite: boolean;
  private readonly ev: LinkEvents;
  private audioTrack: MediaStreamTrack;
  private cameraTrack: MediaStreamTrack | null;
  private audioSender: RTCRtpSender | null = null;
  private videoSender: RTCRtpSender | null = null;

  private started: boolean;
  private outbox: Signal[] = [];
  private pendingCandidates: NonNullable<Extract<Signal, { type: 'candidate' }>['candidate']>[] = [];
  private chain: Promise<void> = Promise.resolve();
  private makingOffer = false;
  private ignoreOffer = false;

  private connectedOnce = false;
  private lastState: LinkState | null = null;
  private restartTimer: number | null = null;
  private deadlineTimer: number | null = null;
  private statsTimer: number | null = null;
  private attempts = 0;
  private closed = false;

  private tracker = new StatsTracker();
  private adapter: Adapter;
  private appliedKey = '';
  private measuring = false;

  constructor(o: LinkOptions) {
    this.polite = o.polite;
    this.ev = o.events;
    this.audioTrack = o.audioTrack;
    this.cameraTrack = o.cameraTrack;
    // The callee answers whenever the offer arrives; the caller waits until it is told the call was answered.
    this.started = o.polite;

    const conn = (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean; downlink?: number } }).connection;
    const begin = startLevel(conn);
    this.adapter = new Adapter({ wantVideo: !!o.cameraTrack, startLevel: begin.level, startAudioOnly: begin.audioOnly });

    this.pc = new RTCPeerConnection({
      iceServers: o.iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      // The caller gathers a few candidates while the phone is still ringing, so the connection is quicker once answered.
      iceCandidatePoolSize: o.polite ? 0 : 2,
    });

    this.pc.ontrack = (e) => {
      if (!this.remoteStream.getTracks().includes(e.track)) this.remoteStream.addTrack(e.track);
    };
    this.pc.onicecandidate = (e) => {
      this.send({ type: 'candidate', candidate: e.candidate ? (e.candidate.toJSON() as never) : null });
    };
    this.pc.onnegotiationneeded = () => {
      void this.enqueue(async () => {
        if (this.closed || !this.started) return;
        try {
          this.makingOffer = true;
          await this.makeLocal();
        } finally {
          this.makingOffer = false;
        }
      });
    };
    this.pc.onconnectionstatechange = () => this.onState();
    this.pc.oniceconnectionstatechange = () => this.onState();

    if (this.started) this.armDeadline(CONNECT_MS);
  }

  /** Caller only: the callee picked up, so begin. */
  start() {
    if (this.started || this.closed) return;
    this.started = true;
    const a = this.pc.addTransceiver(this.audioTrack, { direction: 'sendrecv' });
    this.audioSender = a.sender;
    // A video line is always negotiated, even on a voice call, so the camera can be switched on later without
    // renegotiating. Nothing is sent on it until there is a track.
    const v = this.pc.addTransceiver('video', { direction: 'sendrecv' });
    this.videoSender = v.sender;
    this.armDeadline(CONNECT_MS);
    for (const s of this.outbox.splice(0)) this.ev.signal(s);
  }

  /** A message from the other phone. */
  handleSignal(s: Signal): Promise<void> {
    return this.enqueue(async () => {
      if (this.closed) return;
      if (s.type === 'description') {
        const d = s.description;
        const collision = d.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await this.pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
        await this.flushCandidates();
        if (d.type === 'offer') {
          await this.attachLocal();
          await this.makeLocal();
        }
      } else {
        if (!s.candidate) return; // "no more candidates"
        if (!this.pc.remoteDescription) {
          this.pendingCandidates.push(s.candidate);
          return;
        }
        try {
          await this.pc.addIceCandidate(s.candidate as RTCIceCandidateInit);
        } catch (e) {
          if (!this.ignoreOffer) console.warn('[call] candidate rejected', e);
        }
      }
    });
  }

  setMuted(muted: boolean) {
    this.audioTrack.enabled = !muted;
  }

  /** Switch the camera on (with a track), swap it (flip), or off (null). `startAt` is the picture size to begin with. */
  async setCamera(track: MediaStreamTrack | null, startAt?: number) {
    this.cameraTrack = track;
    if (track) this.adapter.forceVideo(startAt ?? VIDEO_LEVELS.length - 1);
    else this.adapter.setWantVideo(false);
    this.appliedKey = '';
    await this.applyPlan(this.adapter.plan);
  }

  /** Try to repair a stuck connection now, for example because the phone just got its network back. */
  nudge() {
    if (this.closed || !this.connectedOnce) return;
    if (this.computeState() === 'connected') return;
    this.restartIce();
  }

  close() {
    this.closed = true;
    for (const t of [this.restartTimer, this.deadlineTimer]) if (t !== null) window.clearTimeout(t);
    if (this.statsTimer !== null) window.clearInterval(this.statsTimer);
    this.restartTimer = this.deadlineTimer = this.statsTimer = null;
    this.pc.ontrack = this.pc.onicecandidate = this.pc.onnegotiationneeded = this.pc.onconnectionstatechange = this.pc.oniceconnectionstatechange = null;
    try {
      this.pc.close();
    } catch {
      /* already closed */
    }
  }

  /** What the picture settings are right now, for display and tests. */
  get plan(): Plan {
    return this.adapter.plan;
  }

  /* ------------------------------------------------------------------ negotiation */

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn).catch((e) => {
      if (!this.closed) console.warn('[call] negotiation step failed', e);
    });
    return this.chain;
  }

  private send(s: Signal) {
    if (this.started) this.ev.signal(s);
    else this.outbox.push(s);
  }

  private async makeLocal() {
    const pc = this.pc;
    // Read through a function: the state can change while we await, and the compiler must not assume it did not.
    const state = (): RTCSignalingState => pc.signalingState;
    const wasAnswering = state() === 'have-remote-offer';
    const d = wasAnswering ? await pc.createAnswer() : await pc.createOffer();
    if (d.sdp) d.sdp = tuneOpus(d.sdp, AUDIO_KBPS[this.adapter.plan.audio]);
    // If an offer from the other side landed while this one was being prepared, this one is stale: drop it.
    if (wasAnswering ? state() !== 'have-remote-offer' : state() === 'have-remote-offer') return;
    await pc.setLocalDescription(d);
    const local = pc.localDescription;
    if (local) this.send({ type: 'description', description: { type: local.type, sdp: local.sdp } });
  }

  private async flushCandidates() {
    for (const c of this.pendingCandidates.splice(0)) {
      try {
        await this.pc.addIceCandidate(c as RTCIceCandidateInit);
      } catch {
        /* a candidate for a superseded negotiation: harmless */
      }
    }
  }

  /** The callee: put my microphone and camera onto the lines the caller offered. */
  private async attachLocal() {
    for (const t of this.pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      if (kind === 'audio' && !this.audioSender) {
        this.audioSender = t.sender;
        t.direction = 'sendrecv';
        await t.sender.replaceTrack(this.audioTrack);
      } else if (kind === 'video' && !this.videoSender) {
        this.videoSender = t.sender;
        t.direction = 'sendrecv';
        if (this.cameraTrack && this.adapter.plan.video) await t.sender.replaceTrack(this.cameraTrack);
      }
    }
  }

  /* ------------------------------------------------------------------ keeping the connection alive */

  private computeState(): LinkState {
    const cs = this.pc.connectionState;
    const ice = this.pc.iceConnectionState;
    if (cs === 'connected' || (cs === undefined && (ice === 'connected' || ice === 'completed'))) return 'connected';
    if (cs === 'failed' || ice === 'failed' || cs === 'disconnected' || ice === 'disconnected') return 'reconnecting';
    return this.connectedOnce ? 'reconnecting' : 'connecting';
  }

  private onState() {
    if (this.closed) return;
    const st = this.computeState();
    const failedHard = this.pc.connectionState === 'failed' || this.pc.iceConnectionState === 'failed';
    if (st === 'connected') {
      this.clearRepair();
      this.attempts = 0;
      if (!this.connectedOnce) {
        this.connectedOnce = true;
        this.startStats();
        this.ev.firstConnected();
      }
      this.emitState('connected');
      return;
    }
    this.emitState(st);
    if (this.connectedOnce || failedHard) {
      // Give it a moment first: a brief wobble often fixes itself. A hard failure is repaired at once by the caller.
      if (this.deadlineTimer === null) this.armDeadline(GIVE_UP_MS);
      if (this.restartTimer === null) this.scheduleRestart(failedHard ? (this.polite ? 1500 : 0) : this.polite ? 4000 : 2500);
    }
  }

  private emitState(s: LinkState) {
    if (s === this.lastState) return;
    this.lastState = s;
    this.ev.state(s);
  }

  private armDeadline(ms: number) {
    if (this.deadlineTimer !== null) window.clearTimeout(this.deadlineTimer);
    this.deadlineTimer = window.setTimeout(() => {
      this.deadlineTimer = null;
      if (!this.closed && this.computeState() !== 'connected') this.emitState('failed');
    }, ms);
  }

  private clearRepair() {
    if (this.deadlineTimer !== null) window.clearTimeout(this.deadlineTimer);
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.deadlineTimer = this.restartTimer = null;
  }

  private scheduleRestart(delay: number) {
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      if (this.closed || this.computeState() === 'connected') return;
      this.attempts++;
      this.restartIce();
      // Keep trying with growing gaps until the deadline gives up.
      this.scheduleRestart(Math.min(9_000, 2_500 + this.attempts * 1_500));
    }, delay);
  }

  private restartIce() {
    try {
      this.pc.restartIce();
    } catch {
      void this.enqueue(async () => {
        const offer = await this.pc.createOffer({ iceRestart: true });
        await this.pc.setLocalDescription(offer);
        const l = this.pc.localDescription;
        if (l) this.send({ type: 'description', description: { type: l.type, sdp: l.sdp } });
      });
    }
  }

  /* ------------------------------------------------------------------ measuring and adapting */

  private startStats() {
    if (this.statsTimer !== null) return;
    void this.applyPlan(this.adapter.plan);
    this.statsTimer = window.setInterval(() => void this.measure(), STATS_EVERY_MS);
  }

  private async measure() {
    if (this.measuring || this.closed) return;
    this.measuring = true;
    try {
      const report = await this.pc.getStats();
      const sample = this.tracker.ingest([...report.values()] as Stat[], Date.now());
      this.lastSample = sample;
      const d = this.adapter.update(sample, Date.now());
      this.ev.quality(d.quality, sample);
      await this.applyPlan(d.plan);
      if (d.change) this.ev.adapted(d);
    } catch {
      /* statistics are optional */
    } finally {
      this.measuring = false;
    }
  }

  private async applyPlan(plan: Plan) {
    const key = `${plan.video}:${plan.level}:${plan.audio}:${this.cameraTrack?.id ?? ''}`;
    if (key === this.appliedKey) return;
    this.appliedKey = key;
    const level = VIDEO_LEVELS[Math.min(plan.level, VIDEO_LEVELS.length - 1)]!;
    if (this.videoSender) {
      const send = plan.video && !!this.cameraTrack;
      try {
        if (send && this.videoSender.track !== this.cameraTrack) await this.videoSender.replaceTrack(this.cameraTrack);
        else if (!send && this.videoSender.track) await this.videoSender.replaceTrack(null);
      } catch {
        /* the sender may be mid-negotiation; the next measurement tries again */
        this.appliedKey = '';
      }
      if (send) {
        await this.tune(this.videoSender, {
          maxBitrate: level.kbps * 1000,
          maxFramerate: level.fps,
          scaleResolutionDownBy: level.scale,
          priority: 'low',
          networkPriority: 'low',
        });
      }
    }
    if (this.audioSender) {
      await this.tune(this.audioSender, { maxBitrate: AUDIO_KBPS[plan.audio] * 1000, priority: 'high', networkPriority: 'high' });
    }
  }

  private async tune(sender: RTCRtpSender, patch: Record<string, unknown>) {
    try {
      const p = sender.getParameters();
      if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
      Object.assign(p.encodings[0]!, patch);
      await sender.setParameters(p);
    } catch {
      /* not every browser accepts every setting */
    }
  }
}
