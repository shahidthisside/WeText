import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';
import { repairWebm, repairWebmDetailed } from '../src/lib/webm.js';
import { serveUpload } from '../src/routes/uploads.js';

/* ------------------------------------------------------------------ builders: a WebM like Chrome's recorder writes */

function vsize(n: number, len: number): Buffer {
  const b = Buffer.alloc(len);
  let v = n;
  for (let i = len - 1; i >= 0; i--) {
    b[i] = v % 256;
    v = Math.floor(v / 256);
  }
  b[0] |= 0x80 >> (len - 1);
  return b;
}
const unknownSize = (len: number) => Buffer.from([0x01, ...new Array(len - 1).fill(0xff)]);
const id = (n: number) => {
  const hex = n.toString(16);
  return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
};
function el(elId: number, payload: Buffer): Buffer {
  return Buffer.concat([id(elId), vsize(payload.length, 1 + Math.floor(Math.log2(Math.max(1, payload.length)) / 7)), payload]);
}
function uint(elId: number, n: number): Buffer {
  const bytes = n === 0 ? [0] : [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v % 256);
    v = Math.floor(v / 256);
  }
  return el(elId, Buffer.from(bytes));
}
function simpleBlock(rel: number): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0x81; // track 1
  head.writeInt16BE(rel, 1);
  head[3] = 0x80; // keyframe
  return el(0xa3, Buffer.concat([head, Buffer.alloc(40, 0x55)]));
}
/** A cluster with an open-ended size, like a live recording writes. */
function cluster(tc: number, rels: number[]): Buffer {
  return Buffer.concat([id(0x1f43b675), unknownSize(8), uint(0xe7, tc), ...rels.map(simpleBlock)]);
}
function webm(clusters: Buffer[], opts: { duration?: number } = {}): Buffer {
  const ebml = el(0x1a45dfa3, Buffer.concat([uint(0x4286, 1), uint(0x4282 - 0, 1)]));
  const info = el(0x1549a966, Buffer.concat([uint(0x2ad7b1, 1_000_000), ...(opts.duration ? [el(0x4489, (() => { const f = Buffer.alloc(8); f.writeDoubleBE(opts.duration!); return f; })())] : [])]));
  const tracks = el(0x1654ae6b, el(0xae, uint(0xd7, 1)));
  return Buffer.concat([ebml, id(0x18538067), unknownSize(8), info, tracks, ...clusters]);
}
const run = (startTc: number, packets: number, step = 20) => cluster(startTc, Array.from({ length: packets }, (_, i) => i * step));

/** Read the duration (ms) back out of a built/repaired file: the last block's absolute time. */
function lastMs(buf: Buffer): number {
  let last = 0;
  let i = buf.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  while (i >= 0) {
    const tcAt = i + 12 + 1; // id(4) + size(8) + 0xe7 + size(1)
    const tcLen = buf[tcAt]! & 0x7f;
    let tc = 0;
    for (let k = 0; k < tcLen; k++) tc = tc * 256 + buf[tcAt + 1 + k]!;
    let j = tcAt + 1 + tcLen;
    const next = buf.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]), j);
    const end = next < 0 ? buf.length : next;
    while (j < end && buf[j] === 0xa3) {
      const sz = buf[j + 1]! & 0x7f;
      const rel = buf.readInt16BE(j + 2 + 1);
      last = Math.max(last, tc + rel);
      j += 2 + sz;
    }
    i = next;
  }
  return last;
}

/* ------------------------------------------------------------------ unit tests */

describe('repairWebm', () => {
  it('leaves a healthy recording byte-for-byte unchanged', () => {
    const good = webm([run(0, 15), run(300, 15), run(600, 15), run(900, 15)]);
    const r = repairWebmDetailed(good);
    expect(r.repaired).toBe(false);
    expect(r.data.equals(good)).toBe(true);
    expect(repairWebm(good)).toBe(good);
  });

  it('closes a clock jump so a ~3 s clip no longer looks 32 s long', () => {
    // One stray packet at 0 ms, then the real sound starts at 28 969 ms (the shape of the reported clip).
    const broken = webm([cluster(0, [0]), run(28_969, 15), run(29_269, 15), run(29_569, 15), run(29_869, 15)]);
    expect(lastMs(broken)).toBeGreaterThan(30_000);
    const r = repairWebmDetailed(broken);
    expect(r.repaired).toBe(true);
    expect(r.data.length).toBeGreaterThanOrEqual(broken.length);
    const fixed = lastMs(r.data);
    expect(fixed).toBeLessThan(2_000);
    expect(fixed).toBeGreaterThan(900);
  });

  it('writes the real length into a repaired file whose segment size is open-ended', () => {
    const broken = webm([cluster(0, [0]), run(10_000, 15), run(10_300, 15)]);
    const fixed = repairWebm(broken);
    const dur = fixed.indexOf(Buffer.from([0x44, 0x89, 0x88]));
    expect(dur).toBeGreaterThan(0);
    const ms = fixed.readDoubleBE(dur + 3);
    expect(ms).toBeGreaterThan(500);
    expect(ms).toBeLessThan(1_500);
  });

  it('repairs more than one jump', () => {
    const broken = webm([cluster(0, [0]), run(5_000, 10), run(5_200, 10), run(20_000, 10), run(20_200, 10)]);
    const fixed = repairWebm(broken);
    expect(lastMs(fixed)).toBeLessThan(2_000);
  });

  it('does not treat a short pause as a broken clock', () => {
    const paused = webm([run(0, 15), run(300, 15), run(1_200, 15)]);
    expect(repairWebm(paused).equals(paused)).toBe(true);
  });

  it('returns anything it does not understand unchanged', () => {
    const junk = [
      Buffer.alloc(0),
      Buffer.from('definitely not a webm file'),
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]),
      Buffer.alloc(5000, 0x11),
    ];
    for (const j of junk) expect(repairWebm(j)).toBe(j);
    // a truncated real file
    const real = webm([cluster(0, [0]), run(9_000, 15), run(9_300, 15)]);
    expect(() => repairWebm(real.subarray(0, real.length - 17))).not.toThrow();
    expect(() => repairWebm(real.subarray(0, 60))).not.toThrow();
  });

  it('never makes the file shorter than its audio data', () => {
    const broken = webm([cluster(0, [0]), run(9_000, 15), run(9_300, 15)]);
    expect(repairWebm(broken).length).toBeGreaterThanOrEqual(broken.length);
  });
});

/* ------------------------------------------------------------------ end to end: upload, store, serve */

let app: FastifyInstance;
let u: TestUser;

function multipart(data: Buffer) {
  const boundary = '----wetextwebm';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="v.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

beforeAll(async () => {
  app = await makeApp();
  u = await signup(app, 'webmu');
});
afterAll(() => app.close());

describe('voice notes through the API', () => {
  it('stores a repaired copy of a clock-jumped upload and serves it with Range support', async () => {
    const broken = webm([cluster(0, [0]), run(28_969, 15), run(29_269, 15), run(29_569, 15)]);
    const { body, contentType } = multipart(broken);
    const up = await app.inject({ method: 'POST', url: '/api/uploads?kind=audio', headers: { cookie: u.cookie, 'content-type': contentType }, payload: body });
    expect(up.statusCode, up.body).toBe(201);
    const url = up.json().url as string;
    const full = await app.inject({ method: 'GET', url });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toContain('audio/webm');
    expect(lastMs(full.rawPayload)).toBeLessThan(2_000);
    const part = await app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99' } });
    expect(part.statusCode).toBe(206);
    expect(part.rawPayload.length).toBe(100);
    expect(part.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
  });

  it('repairs a clip that was stored before the fix when it is downloaded, without changing what is stored', async () => {
    const broken = webm([cluster(0, [0]), run(28_969, 15), run(29_269, 15)]);
    const uid = u.id;
    const name = 'oldclipbroken1.webm';
    await app.ctx.db.prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)').run(`${uid}/${name}`, uid, 'audio/webm', broken, Date.now());
    const res = await app.inject({ method: 'GET', url: `/uploads/${uid}/${name}` });
    expect(res.statusCode).toBe(200);
    expect(lastMs(res.rawPayload)).toBeLessThan(2_000);
    const stored = (await app.ctx.db.prepare('SELECT data FROM files WHERE path = ?').pluck().get(`${uid}/${name}`)) as Buffer;
    expect(Buffer.from(stored).equals(broken)).toBe(true); // the original bytes are never rewritten
  });

  it('does not alter a healthy clip on upload or download', async () => {
    const good = webm([run(0, 15), run(300, 15), run(600, 15)]);
    const { body, contentType } = multipart(good);
    const up = await app.inject({ method: 'POST', url: '/api/uploads?kind=audio', headers: { cookie: u.cookie, 'content-type': contentType }, payload: body });
    expect(up.statusCode).toBe(201);
    const res = await app.inject({ method: 'GET', url: up.json().url });
    expect(res.rawPayload.equals(good)).toBe(true);
  });

  it('still rejects things that are not audio', async () => {
    const { body, contentType } = multipart(Buffer.from('not audio, just text pretending'));
    const up = await app.inject({ method: 'POST', url: '/api/uploads?kind=audio', headers: { cookie: u.cookie, 'content-type': contentType }, payload: body });
    expect(up.statusCode).toBe(400);
  });
});

void serveUpload;
