import { describe, expect, it } from 'vitest';
import {
  Adapter,
  StatsTracker,
  VIDEO_LEVELS,
  classify,
  formatDuration,
  levelForBandwidth,
  qualityLabel,
  startLevel,
  tuneOpus,
  type StatSample,
} from '../../web/src/lib/call-quality.js';

const sample = (over: Partial<StatSample> = {}): StatSample => ({
  rttMs: 60,
  lossPct: 0,
  jitterMs: 5,
  concealPct: 0,
  outKbps: 500,
  inKbps: 500,
  availOutKbps: 3000,
  inFps: 28,
  limited: 'none',
  ready: true,
  ...over,
});
const GOOD = sample();
const FAIR = sample({ rttMs: 300 });
const POOR = sample({ rttMs: 600, lossPct: 10, availOutKbps: null });
const BAD = sample({ rttMs: 1200, lossPct: 30, availOutKbps: null });

/** Feed one sample every 2 s and return the last decision plus every change seen. */
function run(a: Adapter, s: StatSample, seconds: number, startAt = 0) {
  const changes: string[] = [];
  let t = startAt;
  let last = a.update(s, t);
  for (let i = 0; i < seconds / 2; i++) {
    t += 2000;
    last = a.update(s, t);
    if (last.change) changes.push(last.change);
  }
  return { last, changes, t };
}

describe('classify', () => {
  it('rates samples from good to bad', () => {
    expect(classify(GOOD)).toBe('good');
    expect(classify(FAIR)).toBe('fair');
    expect(classify(POOR)).toBe('poor');
    expect(classify(BAD)).toBe('bad');
    expect(classify(sample({ limited: 'bandwidth' }))).toBe('fair');
    expect(classify(sample({ rttMs: null }))).toBe('good');
    expect(classify(sample({ concealPct: 40 }))).toBe('bad');
    expect(classify(sample({ jitterMs: 200 }))).toBe('poor');
  });
  it('has a label for each rating', () => {
    expect(new Set((['good', 'fair', 'poor', 'bad'] as const).map(qualityLabel)).size).toBe(4);
  });
});

describe('where to start', () => {
  it('starts lower on slow or data-saving connections', () => {
    expect(startLevel(undefined)).toEqual({ level: 0, audioOnly: false });
    expect(startLevel({ effectiveType: '4g' })).toEqual({ level: 0, audioOnly: false });
    expect(startLevel({ effectiveType: '3g' }).level).toBe(2);
    expect(startLevel({ effectiveType: '2g' }).audioOnly).toBe(true);
    expect(startLevel({ effectiveType: 'slow-2g' }).audioOnly).toBe(true);
    expect(startLevel({ effectiveType: '4g', saveData: true }).level).toBe(2);
    expect(startLevel({ effectiveType: '4g', downlink: 0.3 }).level).toBe(3);
  });
});

describe('levelForBandwidth', () => {
  it('picks the best picture that fits, leaving room for voice', () => {
    expect(levelForBandwidth(null)).toBe(0);
    expect(levelForBandwidth(5000)).toBe(0);
    expect(levelForBandwidth(700)).toBe(1);
    expect(levelForBandwidth(350)).toBe(2);
    expect(levelForBandwidth(160)).toBe(3);
    expect(levelForBandwidth(100)).toBe(VIDEO_LEVELS.length); // nothing fits: audio only
    expect(levelForBandwidth(0)).toBe(0); // unknown is not zero
  });
});

describe('StatsTracker', () => {
  const report = (t: number, o: { sent: number; recv: number; pk: number; lost: number; concealed: number; samples: number; frames: number }) => [
    { type: 'outbound-rtp', id: 'oa', kind: 'audio', bytesSent: o.sent, packetsSent: o.pk },
    { type: 'outbound-rtp', id: 'ov', kind: 'video', bytesSent: o.sent * 5, packetsSent: o.pk, qualityLimitationReason: 'bandwidth' },
    { type: 'inbound-rtp', id: 'ia', kind: 'audio', bytesReceived: o.recv, packetsReceived: o.pk, packetsLost: o.lost, jitter: 0.02, concealedSamples: o.concealed, totalSamplesReceived: o.samples },
    { type: 'inbound-rtp', id: 'iv', kind: 'video', bytesReceived: o.recv * 4, packetsReceived: o.pk, packetsLost: 0, framesDecoded: o.frames },
    { type: 'remote-inbound-rtp', id: 'ra', kind: 'audio', roundTripTime: 0.25, fractionLost: 0.02, jitter: 0.01 },
    { type: 'candidate-pair', id: 'cp', state: 'succeeded', nominated: true, currentRoundTripTime: 0.3, availableOutgoingBitrate: 640_000 },
    { type: 'candidate-pair', id: 'other', state: 'failed', nominated: false, currentRoundTripTime: 9, availableOutgoingBitrate: 1 },
    { type: 'transport', id: 't' },
  ].map((x) => ({ ...x, timestamp: t }));

  it('needs two reports before it can say anything, then measures the interval between them', () => {
    const tr = new StatsTracker();
    const first = tr.ingest(report(0, { sent: 0, recv: 0, pk: 0, lost: 0, concealed: 0, samples: 0, frames: 0 }), 0);
    expect(first.ready).toBe(false);
    const s = tr.ingest(report(2000, { sent: 8000, recv: 4000, pk: 100, lost: 10, concealed: 4800, samples: 96000, frames: 56 }), 2000);
    expect(s.ready).toBe(true);
    expect(s.outKbps).toBeCloseTo(((8000 + 40000) * 8) / 1000 / 2, 1);
    expect(s.inKbps).toBeCloseTo(((4000 + 16000) * 8) / 1000 / 2, 1);
    expect(s.lossPct).toBeCloseTo(4.76, 1); // 10 lost of the 210 that should have arrived (audio and video together)
    expect(s.concealPct).toBeCloseTo(5, 5);
    expect(s.jitterMs).toBeCloseTo(20, 5);
    expect(s.rttMs).toBeCloseTo(300, 5); // the larger of the two measurements
    expect(s.availOutKbps).toBe(640);
    expect(s.inFps).toBeCloseTo(28, 5);
    expect(s.limited).toBe('bandwidth');
  });

  it('uses the other side’s loss report when it is worse than what we saw', () => {
    const tr = new StatsTracker();
    const mk = (n: number) => [
      { type: 'inbound-rtp', id: 'ia', kind: 'audio', bytesReceived: n * 100, packetsReceived: n, packetsLost: 0 },
      { type: 'remote-inbound-rtp', id: 'ra', kind: 'audio', fractionLost: 0.15, roundTripTime: 0.1 },
    ];
    tr.ingest(mk(0), 0);
    expect(tr.ingest(mk(50), 2000).lossPct).toBeCloseTo(15, 5);
  });

  it('survives empty, odd and counter-reset reports', () => {
    const tr = new StatsTracker();
    expect(tr.ingest([], 0).ready).toBe(false);
    const s = tr.ingest([{ type: 'inbound-rtp', id: 'x', kind: 'audio', bytesReceived: 'oops' as unknown as number }], 2000);
    expect(s.lossPct).toBe(0);
    tr.ingest([{ type: 'inbound-rtp', id: 'y', kind: 'audio', bytesReceived: 1000, packetsReceived: 50, packetsLost: 5 }], 4000);
    const reset = tr.ingest([{ type: 'inbound-rtp', id: 'y', kind: 'audio', bytesReceived: 10, packetsReceived: 1, packetsLost: 0 }], 6000);
    expect(reset.inKbps).toBe(0);
    expect(reset.lossPct).toBe(0);
  });
});

describe('Adapter on a good connection', () => {
  it('stays at the top and never flaps', () => {
    const a = new Adapter({ wantVideo: true });
    const r = run(a, GOOD, 120);
    expect(r.changes).toEqual([]);
    expect(r.last.plan).toMatchObject({ level: 0, video: true, audio: 'normal' });
  });
  it('ignores samples that are not ready', () => {
    const a = new Adapter({ wantVideo: true });
    expect(run(a, { ...BAD, ready: false }, 60).changes).toEqual([]);
  });
});

describe('Adapter when the connection gets worse', () => {
  it('steps the picture down after a short run of poor samples, not on a single bad one', () => {
    const a = new Adapter({ wantVideo: true });
    run(a, GOOD, 10);
    expect(a.update(POOR, 20_000).change).toBeNull();
    expect(a.update(POOR, 22_000).change).toBeNull();
    const d = a.update(POOR, 24_000);
    expect(d.change).toBe('stepped-down');
    expect(d.plan.level).toBe(1);
    expect(d.quality).toBe('poor');
  });
  it('steps down faster when it is bad', () => {
    const a = new Adapter({ wantVideo: true });
    run(a, GOOD, 10);
    a.update(BAD, 20_000);
    expect(a.update(BAD, 22_000).change).toBe('stepped-down');
  });
  it('does not drop twice inside the cool-down', () => {
    const a = new Adapter({ wantVideo: true });
    a.update(BAD, 0);
    a.update(BAD, 2000);
    a.update(BAD, 4000);
    const levelAfterFirst = a.plan.level;
    a.update(BAD, 6000);
    a.update(BAD, 8000);
    expect(a.plan.level).toBeLessThanOrEqual(levelAfterFirst + 1);
  });
  it('walks down to the smallest picture, then to audio only, if the connection stays terrible', () => {
    const a = new Adapter({ wantVideo: true });
    const r = run(a, BAD, 120);
    expect(r.changes.filter((c) => c === 'stepped-down').length).toBe(VIDEO_LEVELS.length - 1);
    expect(r.changes).toContain('audio-only');
    expect(r.last.plan.video).toBe(false);
    expect(r.last.plan.audio).toBe('lean'); // spend what is left on keeping the voice clear
  });
  it('goes to audio only at once when the network cannot carry even the smallest picture', () => {
    const a = new Adapter({ wantVideo: true });
    run(a, GOOD, 6);
    const d = a.update(sample({ rttMs: 700, lossPct: 12, availOutKbps: 70 }), 10_000);
    expect(d.change).toBe('audio-only');
    expect(d.plan.video).toBe(false);
  });
  it('follows the bandwidth estimate down without waiting for loss', () => {
    const a = new Adapter({ wantVideo: true });
    run(a, GOOD, 8);
    const d = a.update(sample({ availOutKbps: 350 }), 20_000);
    expect(d.change).toBe('stepped-down');
    expect(d.plan.level).toBe(2);
  });
  it('a merely fair connection holds still', () => {
    const a = new Adapter({ wantVideo: true });
    const r = run(a, FAIR, 120);
    expect(r.changes).toEqual([]);
    expect(r.last.plan.level).toBe(0);
  });
});

describe('Adapter when the connection recovers', () => {
  it('climbs back up one step at a time, and only after a steady good stretch', () => {
    const a = new Adapter({ wantVideo: true });
    run(a, BAD, 40);
    const down = a.plan.level;
    expect(down).toBeGreaterThan(0);
    const r = run(a, GOOD, 200, 100_000);
    expect(r.changes.every((c) => c === 'stepped-up' || c === 'video-back')).toBe(true);
    expect(r.last.plan.level).toBe(0);
    expect(r.last.plan.video).toBe(true);
  });
  it('brings the video back after audio-only, at the smallest picture first', () => {
    const a = new Adapter({ wantVideo: true });
    run(a, BAD, 120);
    expect(a.plan.video).toBe(false);
    const r = run(a, GOOD, 40, 500_000);
    expect(r.changes[0]).toBe('video-back');
    expect(r.changes.length).toBeGreaterThanOrEqual(1);
    expect(a.plan.video).toBe(true);
  });
  it('does not flap on a connection that alternates good and poor', () => {
    const a = new Adapter({ wantVideo: true });
    let t = 0;
    const changes: string[] = [];
    for (let i = 0; i < 100; i++) {
      t += 2000;
      const d = a.update(i % 2 ? POOR : GOOD, t);
      if (d.change) changes.push(d.change);
    }
    expect(changes).toEqual([]);
  });
  it('is slower to climb back to a level that just failed', () => {
    const a = new Adapter({ wantVideo: true });
    a.update(BAD, 0);
    a.update(BAD, 2000); // step down at ~2 s
    expect(a.plan.level).toBe(1);
    let t = 4000;
    let upAt = -1;
    for (let i = 0; i < 40 && upAt < 0; i++) {
      t += 2000;
      if (a.update(GOOD, t).change === 'stepped-up') upAt = t;
    }
    expect(upAt).toBeGreaterThan(2000 + 6 * 2000); // more than the plain six good samples
  });
});

describe('Adapter and the camera switch', () => {
  it('sends no video on an audio call, whatever the network does', () => {
    const a = new Adapter({ wantVideo: false });
    expect(a.plan.video).toBe(false);
    expect(run(a, BAD, 60).changes).toEqual([]);
    expect(a.plan.video).toBe(false);
  });
  it('turning the camera on mid-call starts from the smallest picture', () => {
    const a = new Adapter({ wantVideo: false });
    a.setWantVideo(true);
    a.forceVideo();
    expect(a.plan).toMatchObject({ video: true, level: VIDEO_LEVELS.length - 1 });
  });
  it('turning the camera off stays off', () => {
    const a = new Adapter({ wantVideo: true });
    a.setWantVideo(false);
    expect(run(a, GOOD, 60).last.plan.video).toBe(false);
  });
  it('honours a slow-connection start', () => {
    const a = new Adapter({ wantVideo: true, startLevel: 3, startAudioOnly: true });
    expect(a.plan.video).toBe(false);
    expect(run(a, GOOD, 40).last.plan.video).toBe(true);
  });
});

describe('tuneOpus', () => {
  const sdp = (fmtp: string) =>
    ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63', 'a=rtpmap:111 opus/48000/2', ...(fmtp ? [fmtp] : []), 'a=rtpmap:63 red/48000/2', ''].join('\r\n');

  it('changes an existing format line and keeps the settings it already had', () => {
    const out = tuneOpus(sdp('a=fmtp:111 minptime=10;useinbandfec=1;foo=bar'), 24);
    const line = out.split('\r\n').find((l) => l.startsWith('a=fmtp:111'))!;
    expect(line).toContain('usedtx=1');
    expect(line).toContain('useinbandfec=1');
    expect(line).toContain('stereo=0');
    expect(line).toContain('maxaveragebitrate=24000');
    expect(line).toContain('minptime=20');
    expect(line).toContain('foo=bar');
    expect(out.match(/a=fmtp:111/g)).toHaveLength(1);
  });
  it('adds a format line when there is none, in the right place', () => {
    const out = tuneOpus(sdp(''));
    const lines = out.split('\r\n');
    const i = lines.indexOf('a=rtpmap:111 opus/48000/2');
    expect(lines[i + 1]).toMatch(/^a=fmtp:111 .*usedtx=1/);
    expect(lines[i + 2]).toBe('a=rtpmap:63 red/48000/2');
  });
  it('keeps plain newlines and is safe to run twice', () => {
    const lf = sdp('').replace(/\r\n/g, '\n');
    const once = tuneOpus(lf);
    expect(once).not.toContain('\r');
    expect(tuneOpus(once)).toBe(once);
  });
  it('leaves a description without Opus exactly as it was', () => {
    const none = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n';
    expect(tuneOpus(none)).toBe(none);
    expect(tuneOpus('')).toBe('');
  });
});

describe('formatDuration', () => {
  it('formats minutes, seconds and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(999)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('0:00');
  });
});
