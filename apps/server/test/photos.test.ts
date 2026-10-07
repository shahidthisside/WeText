import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { config } from '../src/config.js';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let ana: TestUser;
beforeAll(async () => {
  app = await makeApp();
  ana = await signup(app, 'ana_photos');
});
afterAll(() => app.close());

async function upload(user: TestUser, data: Buffer, mime = 'image/png', kind = 'media') {
  const boundary = '----wetext';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x"\r\nContent-Type: ${mime}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/uploads?kind=${kind}`,
    headers: { cookie: user.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
}

const png = (w = 40, h = 40) => sharp({ create: { width: w, height: h, channels: 3, background: '#aa5533' } }).png().toBuffer();

describe('photos stored in the database', () => {
  it('stores the re-encoded image in the files table and serves it with long-lived caching', async () => {
    const up = await upload(ana, await png());
    expect(up.statusCode, up.body).toBe(201);
    const { url } = up.json();

    const row = (await app.ctx.db.prepare('SELECT mime, LENGTH(data) AS bytes, user_id FROM files WHERE path = ?').get(url.slice('/uploads/'.length))) as {
      mime: string;
      bytes: number;
      user_id: string;
    };
    expect(row.mime).toBe('image/webp');
    expect(row.user_id).toBe(ana.id);
    expect(row.bytes).toBeGreaterThan(0);

    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.rawPayload.length).toBe(row.bytes);
    // really a webp
    expect((await sharp(res.rawPayload).metadata()).format).toBe('webp');
  });

  it('returns 404 for unknown files and rejects path tricks', async () => {
    expect((await app.inject({ method: 'GET', url: `/uploads/${ana.id}/nope.webp` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/uploads/${ana.id}/..%2F..%2Fetc%2Fpasswd` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/uploads/UPPER_CASE/x.webp` })).statusCode).toBe(404);
  });

  it('rejects non-images and anonymous uploads without storing anything', async () => {
    const before = ((await app.ctx.db.prepare('SELECT COUNT(*) FROM files').pluck().get()) as number);
    const text = await upload(ana, Buffer.from('not an image'), 'text/plain');
    expect(text.statusCode).toBe(400);
    const fake = await upload(ana, Buffer.from('not really a png'), 'image/png');
    expect(fake.statusCode).toBe(400);
    const anon = await app.inject({ method: 'POST', url: '/api/uploads', payload: {} });
    expect(anon.statusCode).toBe(401);
    expect((await app.ctx.db.prepare('SELECT COUNT(*) FROM files').pluck().get()) as number).toBe(before);
  });

  it('refuses uploads past the per-account storage limit', async () => {
    const bob = await signup(app, 'bob_photos');
    const original = config.photoQuotaBytes;
    config.photoQuotaBytes = 2 * 1024 * 1024;
    try {
      await app.ctx.db
        .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, zeroblob(?), ?)')
        .run(`${bob.id}/filler.webp`, bob.id, 'image/webp', 2 * 1024 * 1024 - 10, Date.now());
      const res = await upload(bob, await png());
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('storage_full');
    } finally {
      config.photoQuotaBytes = original;
    }
  });

  it('recompresses oversized results and rejects images that cannot fit', async () => {
    const original = config.maxStoredPhotoBytes;
    try {
      // noisy photo-like image: big at high quality, much smaller at low quality
      const noise = await sharp(Buffer.from(Array.from({ length: 600 * 600 * 3 }, (_, i) => (i * 7919 + (i >> 3) * 31) & 255)), {
        raw: { width: 600, height: 600, channels: 3 },
      })
        .png()
        .toBuffer();
      const normal = await upload(ana, noise);
      expect(normal.statusCode).toBe(201);
      const stored = ((await app.ctx.db.prepare('SELECT LENGTH(data) FROM files WHERE path = ?').pluck().get(normal.json().url.slice('/uploads/'.length))) as number);
      // with a tiny limit nothing fits
      config.maxStoredPhotoBytes = 100;
      const tooBig = await upload(ana, noise);
      expect(tooBig.statusCode).toBe(400);
      expect(tooBig.json().code).toBe('too_large');
      expect(stored).toBeGreaterThan(100);
    } finally {
      config.maxStoredPhotoBytes = original;
    }
  });

  it('deletes a user’s photos when their account is deleted', async () => {
    const cy = await signup(app, 'cy_photos');
    const { url } = (await upload(cy, await png())).json();
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    const del = await api(app, cy).post('/api/auth/delete-account', { password: 'passw0rd!' });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
  });
});
