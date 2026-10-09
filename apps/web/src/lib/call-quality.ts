/**
 * Everything that decides how a call behaves on a weak connection, with no browser APIs in it so it can be tested.
 *
 *  1. `StatsTracker` turns the browser's raw WebRTC statistics into one easy-to-read sample every couple of seconds
 *     (delay, packet loss, jitter, how much audio had to be patched over, bandwidth the network says it has).
 *  2. `classify` rates a sample: good, fair, poor or bad.
 *  3. `Adapter` watches those ratings and picks how much video to send. It steps down quickly when the connection
 *     gets worse, steps up slowly when it has been good for a while, and falls back to audio only when even the
 *     smallest video does not fit. Audio always has priority: a call where you can hear each other beats a picture.
 */

/* ------------------------------------------------------------------ the send ladder */

export interface VideoLevel {
  name: 'high' | 'medium' | 'low' | 'minimal';
  /** Upper limit for the video encoder, in kilobits per second. */
  kbps: number;
  fps: number;
  /** 1 sends the camera picture as captured; 2 sends half the width and height. */
  scale: number;
}

/** From best to worst. The camera is captured at 640x360, so 'minimal' is 320x180. */
export const VIDEO_LEVELS: readonly VideoLevel[] = [
  { name: 'high', kbps: 800, fps: 30, scale: 1 },
  { name: 'medium', kbps: 450, fps: 24, scale: 1 },
  { name: 'low', kbps: 220, fps: 15, scale: 1.5 },
  { name: 'minimal', kbps: 90, fps: 10, scale: 2 },
];

export const AUDIO_KBPS = { normal: 32, lean: 16 } as const;

/** What a person on a given kind of connection should begin with. */
export function startLevel(conn: { effectiveType?: string; saveData?: boolean; downlink?: number } | undefined): { level: number; audioOnly: boolean } {
  if (!conn) return { level: 0, audioOnly: false };
  const t = conn.effectiveType;
  if (t === 'slow-2g' || t === '2g') return { level: VIDEO_LEVELS.length - 1, audioOnly: true };
  if (conn.saveData) return { level: 2, audioOnly: false };
  if (t === '3g') return { level: 2, audioOnly: false };
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 0.6) return { level: 3, audioOnly: false };
  return { level: 0, audioOnly: false };
}

/** The best level whose bitrate fits inside what the network says it can send, with some headroom. */
export function levelForBandwidth(availableKbps: number | null): number {
  if (availableKbps === null || !Number.isFinite(availableKbps) || availableKbps <= 0) return 0;
  for (let i = 0; i < VIDEO_LEVELS.length; i++) {
    // The 32 kbps of audio and the protocol overhead come out of the same pipe.
    if (VIDEO_LEVELS[i]!.kbps * 1.25 + 40 <= availableKbps) return i;
  }
  return VIDEO_LEVELS.length; // nothing fits: audio only
}

/* ------------------------------------------------------------------ turning raw stats into a sample */

export interface StatSample {
  /** Round-trip delay in milliseconds, or null if the browser has not measured it yet. */
  rttMs: number | null;
  /** Share of packets lost over the last interval, 0 to 100 (the worse of what we saw and what the other side reports). */
  lossPct: number;
  jitterMs: number;
  /** Share of audio the decoder had to invent (hide gaps) over the last interval, 0 to 100. */
  concealPct: number;
  outKbps: number;
  inKbps: number;
  /** Bandwidth the browser estimates it can send, in kilobits per second. */
  availOutKbps: number | null;
  /** Video frames per second arriving, or null with no video. */
  inFps: number | null;
  /** Why the encoder is holding back, if it is. */
  limited: 'none' | 'bandwidth' | 'cpu' | 'other';
  /** True once the first real measurement exists (the first call to ingest has nothing to compare with). */
  ready: boolean;
}

type Stat = Record<string, unknown> & { type: string };
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Keeps the previous counters so each new report can be turned into "what happened in the last N seconds".
 * Pass `[...report.values()]` from `RTCPeerConnection.getStats()`.
 */
export class StatsTracker {
  private prev = new Map<string, { bytes: number; packets: number; lost: number; concealed: number; samples: number; frames: number; at: number }>();
  private seeded = false;

  ingest(stats: Stat[], now: number): StatSample {
    let rtt: number | null = null;
    let remoteLoss = 0;
    let jitterMs = 0;
    let avail: number | null = null;
    let outBytesDelta = 0;
    let inBytesDelta = 0;
    let lostDelta = 0;
    let recvDelta = 0;
    let concealedDelta = 0;
    let samplesDelta = 0;
    let inFps: number | null = null;
    let limited: StatSample['limited'] = 'none';
    let dtMax = 0;

    const delta = (id: string, cur: { bytes?: number | null; packets?: number | null; lost?: number | null; concealed?: number | null; samples?: number | null; frames?: number | null }) => {
      const before = this.prev.get(id);
      const next = {
        bytes: cur.bytes ?? before?.bytes ?? 0,
        packets: cur.packets ?? before?.packets ?? 0,
        lost: cur.lost ?? before?.lost ?? 0,
        concealed: cur.concealed ?? before?.concealed ?? 0,
        samples: cur.samples ?? before?.samples ?? 0,
        frames: cur.frames ?? before?.frames ?? 0,
        at: now,
      };
      this.prev.set(id, next);
      if (!before) return null;
      const dt = Math.max(0.001, (now - before.at) / 1000);
      dtMax = Math.max(dtMax, dt);
      return {
        dt,
        bytes: Math.max(0, next.bytes - before.bytes),
        packets: Math.max(0, next.packets - before.packets),
        lost: Math.max(0, next.lost - before.lost),
        concealed: Math.max(0, next.concealed - before.concealed),
        samples: Math.max(0, next.samples - before.samples),
        frames: Math.max(0, next.frames - before.frames),
      };
    };

    for (const s of stats) {
      const id = String(s.id ?? s.type);
      switch (s.type) {
        case 'outbound-rtp': {
          const d = delta(id, { bytes: num(s.bytesSent), packets: num(s.packetsSent) });
          if (d) outBytesDelta += d.bytes;
          if (s.kind === 'video') {
            const reason = s.qualityLimitationReason;
            if (reason === 'bandwidth') limited = 'bandwidth';
            else if (reason === 'cpu' && limited === 'none') limited = 'cpu';
            else if (reason === 'other' && limited === 'none') limited = 'other';
          }
          break;
        }
        case 'remote-inbound-rtp': {
          const r = num(s.roundTripTime);
          if (r !== null) rtt = Math.max(rtt ?? 0, r * 1000);
          const fl = num(s.fractionLost);
          if (fl !== null) remoteLoss = Math.max(remoteLoss, fl * 100);
          const j = num(s.jitter);
          if (j !== null) jitterMs = Math.max(jitterMs, j * 1000);
          break;
        }
        case 'inbound-rtp': {
          const d = delta(id, {
            bytes: num(s.bytesReceived),
            packets: num(s.packetsReceived),
            lost: num(s.packetsLost),
            concealed: s.kind === 'audio' ? num(s.concealedSamples) : null,
            samples: s.kind === 'audio' ? num(s.totalSamplesReceived) : null,
            frames: s.kind === 'video' ? num(s.framesDecoded) : null,
          });
          const j = num(s.jitter);
          if (j !== null) jitterMs = Math.max(jitterMs, j * 1000);
          if (d) {
            inBytesDelta += d.bytes;
            recvDelta += d.packets;
            lostDelta += d.lost;
            if (s.kind === 'audio') {
              concealedDelta += d.concealed;
              samplesDelta += d.samples;
            } else if (s.kind === 'video') {
              inFps = d.frames / d.dt;
            }
          }
          break;
        }
        case 'candidate-pair': {
          // Only the pair that is in use.
          if (s.state !== 'succeeded' || !(s.nominated === true || s.selected === true)) break;
          const r = num(s.currentRoundTripTime);
          if (r !== null) rtt = Math.max(rtt ?? 0, r * 1000);
          const a = num(s.availableOutgoingBitrate);
          if (a !== null) avail = a / 1000;
          break;
        }
      }
    }

    const seenLoss = recvDelta + lostDelta > 0 ? (lostDelta / (recvDelta + lostDelta)) * 100 : 0;
    const ready = this.seeded && dtMax > 0;
    this.seeded = true;
    const dt = dtMax || 1;
    return {
      rttMs: rtt,
      lossPct: Math.min(100, Math.max(seenLoss, remoteLoss)),
      jitterMs,
      concealPct: samplesDelta > 0 ? Math.min(100, (concealedDelta / samplesDelta) * 100) : 0,
      outKbps: (outBytesDelta * 8) / 1000 / dt,
      inKbps: (inBytesDelta * 8) / 1000 / dt,
      availOutKbps: avail,
      inFps,
      limited,
      ready,
    };
  }
}

/* ------------------------------------------------------------------ rating a sample */

export type Quality = 'good' | 'fair' | 'poor' | 'bad';

export function classify(s: StatSample): Quality {
  const rtt = s.rttMs ?? 0;
  if (rtt > 900 || s.lossPct > 20 || s.concealPct > 35) return 'bad';
  if (rtt > 450 || s.lossPct > 8 || s.concealPct > 15 || s.jitterMs > 180) return 'poor';
  if (rtt > 220 || s.lossPct > 3 || s.concealPct > 5 || s.jitterMs > 70 || s.limited === 'bandwidth') return 'fair';
  return 'good';
}

/* ------------------------------------------------------------------ choosing what to send */

export interface Plan {
  /** Index into VIDEO_LEVELS; ignored when `video` is false. */
  level: number;
  /** Whether to send the camera at all. False means the other person hears me but does not see me. */
  video: boolean;
  audio: keyof typeof AUDIO_KBPS;
}

export interface Decision {
  plan: Plan;
  quality: Quality;
  /** What changed this time, in plain words, for the interface to show. Null if nothing changed. */
  change: null | 'stepped-down' | 'stepped-up' | 'audio-only' | 'video-back';
}

export interface AdapterOptions {
  /** The camera is wanted at all (the person has not switched it off, and it is a video call). */
  wantVideo: boolean;
  startLevel?: number;
  /** Start with the camera paused because the connection is already very slow. */
  startAudioOnly?: boolean;
}

/** Number of samples in a row needed before acting. One sample is about two seconds. */
const DOWN_AFTER = { bad: 2, poor: 3 } as const;
const AUDIO_ONLY_AFTER_BAD = 4;
const AUDIO_ONLY_AFTER_POOR = 8;
const UP_AFTER_GOOD = 6;
const VIDEO_BACK_AFTER_GOOD = 8;
const COOLDOWN_MS = 6_000;

export class Adapter {
  private level: number;
  private autoAudioOnly: boolean;
  private wantVideo: boolean;
  private bad = 0;
  private poor = 0;
  private good = 0;
  private lastChange = -Infinity;
  /** The best level we have reason to believe works; stepping up beyond a level that failed before is slower. */
  private failedAt = new Map<number, number>();
  private lastQuality: Quality = 'good';

  constructor(opts: AdapterOptions) {
    this.wantVideo = opts.wantVideo;
    this.level = Math.min(VIDEO_LEVELS.length - 1, Math.max(0, opts.startLevel ?? 0));
    this.autoAudioOnly = !!opts.startAudioOnly && opts.wantVideo;
  }

  setWantVideo(want: boolean) {
    this.wantVideo = want;
    if (!want) this.autoAudioOnly = false;
  }

  /**
   * The person turned the camera on (possibly while we were in automatic audio-only): respect that. Start at the
   * smallest picture unless the caller knows the network can carry more, then climb from there.
   */
  forceVideo(level: number = VIDEO_LEVELS.length - 1) {
    this.wantVideo = true;
    this.autoAudioOnly = false;
    this.level = Math.min(VIDEO_LEVELS.length - 1, Math.max(0, level));
    this.bad = this.poor = this.good = 0;
    this.lastChange = -Infinity;
  }

  get plan(): Plan {
    return {
      level: this.level,
      video: this.wantVideo && !this.autoAudioOnly,
      audio: this.audioProfile(),
    };
  }

  private audioProfile(): Plan['audio'] {
    // When the connection is struggling, spend the few bits there are on keeping the voice clear.
    const struggling = this.lastQuality === 'bad' || this.lastQuality === 'poor';
    const tiny = this.level >= VIDEO_LEVELS.length - 1 || this.autoAudioOnly || !this.wantVideo;
    return struggling && tiny ? 'lean' : 'normal';
  }

  update(sample: StatSample, now: number): Decision {
    const quality = classify(sample);
    this.lastQuality = quality;
    if (!sample.ready) return { plan: this.plan, quality, change: null };

    if (quality === 'bad') {
      this.bad++;
      this.poor++;
      this.good = 0;
    } else if (quality === 'poor') {
      this.poor++;
      this.bad = 0;
      this.good = 0;
    } else if (quality === 'good') {
      this.good++;
      this.bad = 0;
      this.poor = 0;
    } else {
      // fair: neither worse nor better. Hold still, and do not let old streaks add up across it.
      this.bad = 0;
      this.poor = 0;
      this.good = 0;
    }

    let change: Decision['change'] = null;
    const cooled = now - this.lastChange >= COOLDOWN_MS;

    // What the browser says the network can carry is a fast, reliable signal: never stay above it.
    const ceiling = levelForBandwidth(sample.availOutKbps);
    if (this.wantVideo && !this.autoAudioOnly && sample.availOutKbps !== null && sample.availOutKbps > 0) {
      if (ceiling >= VIDEO_LEVELS.length) {
        if (this.bad + this.poor >= 1 || sample.availOutKbps < 60) change = this.goAudioOnly(now);
      } else if (this.level < ceiling && cooled) {
        this.failedAt.set(this.level, now);
        this.level = ceiling;
        this.lastChange = now;
        change = 'stepped-down';
      }
    }

    if (!change && this.wantVideo) {
      if (!this.autoAudioOnly) {
        const wantDown = (quality === 'bad' && this.bad >= DOWN_AFTER.bad) || (quality === 'poor' && this.poor >= DOWN_AFTER.poor);
        if (wantDown && cooled) {
          if (this.level < VIDEO_LEVELS.length - 1) {
            this.failedAt.set(this.level, now);
            this.level++;
            this.lastChange = now;
            this.bad = this.poor = 0;
            change = 'stepped-down';
          } else if (this.bad >= AUDIO_ONLY_AFTER_BAD || this.poor >= AUDIO_ONLY_AFTER_POOR) {
            change = this.goAudioOnly(now);
          }
        } else if (!wantDown && quality === 'good' && this.good >= UP_AFTER_GOOD && cooled && this.level > 0) {
          // Be slower to go back up to a level that recently did not work.
          const failed = this.failedAt.get(this.level - 1);
          const wait = failed !== undefined && now - failed < 30_000 ? 2 : 1;
          if (this.good >= UP_AFTER_GOOD * wait && this.level - 1 >= ceiling) {
            this.level--;
            this.lastChange = now;
            this.good = 0;
            change = 'stepped-up';
          }
        }
      } else if (quality === 'good' && this.good >= VIDEO_BACK_AFTER_GOOD && cooled && ceiling < VIDEO_LEVELS.length) {
        this.autoAudioOnly = false;
        this.level = Math.max(ceiling, VIDEO_LEVELS.length - 1); // come back at the smallest picture, then climb
        this.lastChange = now;
        this.good = 0;
        change = 'video-back';
      }
    }

    return { plan: this.plan, quality, change };
  }

  private goAudioOnly(now: number): 'audio-only' {
    this.autoAudioOnly = true;
    this.lastChange = now;
    this.bad = this.poor = this.good = 0;
    return 'audio-only';
  }
}

/* ------------------------------------------------------------------ the voice codec settings */

/**
 * Tunes the Opus line of a session description for bad networks: mono, packet-loss repair on, silence not sent
 * (saves a lot of data when someone is not talking), and a ceiling on the voice bitrate. Returns the text unchanged
 * if there is no Opus line, so it can never make a description worse.
 */
export function tuneOpus(sdp: string, maxKbps: number = AUDIO_KBPS.normal): string {
  const rtpmap = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1]!;
  const wanted: Record<string, string> = {
    stereo: '0',
    'sprop-stereo': '0',
    useinbandfec: '1',
    usedtx: '1',
    maxaveragebitrate: String(Math.round(maxKbps * 1000)),
    minptime: '20',
    maxplaybackrate: '48000',
  };
  const line = new RegExp(`^a=fmtp:${pt} ([^\\r\\n]*)`, 'm');
  const existing = sdp.match(line);
  if (existing) {
    const params = new Map<string, string>();
    for (const part of existing[1]!.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k) params.set(k, v.join('='));
    }
    for (const [k, v] of Object.entries(wanted)) params.set(k, v);
    const joined = [...params].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';');
    return sdp.replace(line, `a=fmtp:${pt} ${joined}`);
  }
  const joined = Object.entries(wanted).map(([k, v]) => `${k}=${v}`).join(';');
  // Insert straight after the rtpmap line, keeping the line endings the description already uses.
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  return sdp.replace(rtpmap[0]!, `${rtpmap[0]!}${eol}a=fmtp:${pt} ${joined}`);
}

/* ------------------------------------------------------------------ small display helpers */

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A short label for the connection indicator. */
export function qualityLabel(q: Quality): string {
  return q === 'good' ? 'Good connection' : q === 'fair' ? 'Connection is okay' : q === 'poor' ? 'Weak connection' : 'Very weak connection';
}
