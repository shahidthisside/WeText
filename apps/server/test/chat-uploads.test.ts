import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as ioClient, type Socket } from 'socket.io-client';
import { api, makeApp, signup, type TestUser } from './helpers.js';
import { serveUpload, sniffAudio } from '../src/routes/uploads.js';

let app: FastifyInstance;
let base: string;
let a: TestUser, b: TestUser;
const sockets: Socket[] = [];

/** A minimal valid-ish WebM header (EBML magic) + padding. */
function webmBytes(len = 4096): Buffer {
  const b = Buffer.alloc(len, 0x11);
  b[0] = 0x1a;
  b[1] = 0x45;
  b[2] = 0xdf;
  b[3] = 0xa3;
  return b;
}

function multipart(field: string, filename: string, mime: string, data: Buffer) {
  const boundary = '----wetextaudio';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

beforeAll(async () => {
  app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  a = await signup(app, 'auda');
  b = await signup(app, 'audb');
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await app.close();
});

describe('audio magic-byte sniffing (point 12)', () => {
  it('detects each supported container', () => {
    expect(sniffAudio(webmBytes())?.mime).toBe('audio/webm');
    expect(sniffAudio(Buffer.from('OggS' + 'x'.repeat(20)))?.mime).toBe('audio/ogg');
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftyp'), Buffer.alloc(8)]);
    expect(sniffAudio(mp4)?.mime).toBe('audio/mp4');
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(4)]);
    expect(sniffAudio(wav)?.mime).toBe('audio/wav');
    expect(sniffAudio(Buffer.from('ID3' + 'x'.repeat(20)))?.mime).toBe('audio/mpeg');
    // A disguised text file is rejected.
    expect(sniffAudio(Buffer.from('this is definitely not audio at all'))).toBeNull();
  });
});

describe('audio upload endpoint (point 12)', () => {
  it('accepts a real webm regardless of claimed mime and stores correct type', async () => {
    // Claim image/png but send webm bytes: sniffing wins.
    const { body, contentType } = multipart('file', 'clip.png', 'image/png', webmBytes());
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads?kind=audio',
      headers: { cookie: a.cookie, 'content-type': contentType },
      payload: body,
    });
    expect(up.statusCode, up.body).toBe(201);
    const { url } = up.json();
    expect(url).toMatch(/\.webm$/);
    const stored = (await app.ctx.db.prepare('SELECT mime FROM files WHERE path = ?').get(url.replace('/uploads/', ''))) as { mime: string };
    expect(stored.mime).toBe('audio/webm');
  });

  it('rejects a non-audio file', async () => {
    const { body, contentType } = multipart('file', 'notes.txt', 'audio/webm', Buffer.from('just some plain text, not audio'));
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads?kind=audio',
      headers: { cookie: a.cookie, 'content-type': contentType },
      payload: body,
    });
    expect(up.statusCode).toBe(400);
  });

  it('rejects audio over 2.5 MB', async () => {
    const big = webmBytes(Math.round(2.6 * 1024 * 1024));
    const { body, contentType } = multipart('file', 'big.webm', 'audio/webm', big);
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads?kind=audio',
      headers: { cookie: a.cookie, 'content-type': contentType },
      payload: body,
    });
    expect(up.statusCode).toBe(400);
    expect(up.json().code).toBe('too_large');
  });

  it('counts audio towards the storage quota', async () => {
    const { body, contentType } = multipart('file', 'c.webm', 'audio/webm', webmBytes(2048));
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads?kind=audio',
      headers: { cookie: b.cookie, 'content-type': contentType },
      payload: body,
    });
    expect(up.statusCode).toBe(201);
    const used = (await app.ctx.db.prepare('SELECT COALESCE(SUM(LENGTH(data)),0) AS n FROM files WHERE user_id = ?').get(b.id)) as { n: number };
    expect(used.n).toBeGreaterThanOrEqual(2048);
  });
});

/** Build a mock Fastify reply that records what serveUpload does. */
function mockReply() {
  const state: { status: number; headers: Record<string, unknown>; type?: string; payload?: unknown } = {
    status: 200,
    headers: {},
  };
  const reply = {
    code(n: number) {
      state.status = n;
      return reply;
    },
    header(k: string, v: unknown) {
      state.headers[k.toLowerCase()] = v;
      return reply;
    },
    type(t: string) {
      state.type = t;
      return reply;
    },
    send(p?: unknown) {
      state.payload = p;
      return reply;
    },
  };
  return { reply: reply as never, state };
}

describe('serveUpload Range support (point 12)', () => {
  it('serves audio with Accept-Ranges and a correct 206 for a byte range', async () => {
    const name = `${'e'.repeat(14)}.webm`;
    const data = webmBytes(1000);
    await app.ctx.db
      .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(`${a.id}/${name}`, a.id, 'audio/webm', data, Date.now());

    // Full request.
    const full = mockReply();
    await serveUpload(app.ctx.db, { headers: {} } as never, full.reply, a.id, name);
    expect(full.state.status).toBe(200);
    expect(full.state.type).toBe('audio/webm');
    expect(full.state.headers['accept-ranges']).toBe('bytes');
    expect(full.state.headers['content-length']).toBe(1000);

    // Range request: bytes 100-199.
    const ranged = mockReply();
    await serveUpload(app.ctx.db, { headers: { range: 'bytes=100-199' } } as never, ranged.reply, a.id, name);
    expect(ranged.state.status).toBe(206);
    expect(ranged.state.headers['content-range']).toBe('bytes 100-199/1000');
    expect(ranged.state.headers['content-length']).toBe(100);
    expect((ranged.state.payload as Buffer).length).toBe(100);

    // Open-ended suffix range.
    const suffix = mockReply();
    await serveUpload(app.ctx.db, { headers: { range: 'bytes=-50' } } as never, suffix.reply, a.id, name);
    expect(suffix.state.status).toBe(206);
    expect(suffix.state.headers['content-range']).toBe('bytes 950-999/1000');

    // Unsatisfiable range -> 416.
    const bad = mockReply();
    await serveUpload(app.ctx.db, { headers: { range: 'bytes=5000-6000' } } as never, bad.reply, a.id, name);
    expect(bad.state.status).toBe(416);
  });

  it('still serves images with long caching and rejects unknown names', async () => {
    const name = `${'f'.repeat(14)}.webp`;
    await app.ctx.db
      .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(`${a.id}/${name}`, a.id, 'image/webp', Buffer.from([0x1, 0x2, 0x3]), Date.now());
    const img = mockReply();
    await serveUpload(app.ctx.db, { headers: {} } as never, img.reply, a.id, name);
    expect(img.state.status).toBe(200);
    expect(img.state.type).toBe('image/webp');
    expect(img.state.headers['cache-control']).toContain('immutable');

    const missing = mockReply();
    await serveUpload(app.ctx.db, { headers: {} } as never, missing.reply, a.id, 'bad name!.exe');
    expect(missing.state.status).toBe(404);
  });
});

describe('recording socket event (point 13)', () => {
  function connect(u: TestUser): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(base, { extraHeaders: { cookie: u.cookie }, transports: ['websocket'] });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  it('relays recording on/off to the other member only', async () => {
    const sa = await connect(a);
    const sb = await connect(b);
    const id = (await api(app, a).post('/api/conversations', { username: 'audb' })).json().conversation.id;

    const got = new Promise<{ conversationId: string; on: boolean; userId: string }>((resolve) => sb.once('recording', resolve));
    sa.emit('recording', { conversationId: id, on: true });
    const payload = await got;
    // The recording payload now also carries the sender's userId (added for group chats; 1:1 stays
    // backward-compatible by keeping conversationId + on).
    expect(payload).toMatchObject({ conversationId: id, on: true });
    expect(payload.userId).toBe(a.id);
  });
});
