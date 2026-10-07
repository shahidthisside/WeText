import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { outbox } from '../src/lib/mailer.js';
import { api, makeApp, signup } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());
beforeEach(() => {
  outbox.length = 0;
});

const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s&"]+)/.exec(text)![1]!);

describe('forgot / reset password', () => {
  it('emails a link for a real account and answers identically for unknown emails', async () => {
    await signup(app, 'resetter');
    const known = await api(app).post('/api/auth/forgot', { email: 'resetter@example.com' });
    const unknown = await api(app).post('/api/auth/forgot', { email: 'nobody@example.com' });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual(known.json());
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe('resetter@example.com');
    expect(outbox[0]!.text).toContain('/reset-password?token=');
  });

  it('resets the password once, signs out old sessions, and the token cannot be reused', async () => {
    const u = await signup(app, 'resetter2');
    await api(app).post('/api/auth/forgot', { email: 'resetter2@example.com' });
    const token = tokenFrom(outbox[0]!.text);

    const weak = await api(app).post('/api/auth/reset-password', { token, password: 'short' });
    expect(weak.statusCode).toBe(400);

    const ok = await api(app).post('/api/auth/reset-password', { token, password: 'brandNew123' });
    expect(ok.statusCode).toBe(200);

    // old session is gone, old password fails, new password works
    expect((await api(app, u).get('/api/auth/me')).json().user).toBeNull();
    expect((await api(app).post('/api/auth/login', { login: 'resetter2', password: 'passw0rd!' })).statusCode).toBe(401);
    expect((await api(app).post('/api/auth/login', { login: 'resetter2', password: 'brandNew123' })).statusCode).toBe(200);

    const again = await api(app).post('/api/auth/reset-password', { token, password: 'anotherOne456' });
    expect(again.statusCode).toBe(400);
    expect(again.json().code).toBe('invalid_token');
  });

  it('rejects made-up and expired tokens', async () => {
    const bad = await api(app).post('/api/auth/reset-password', { token: 'x'.repeat(40), password: 'brandNew123' });
    expect(bad.statusCode).toBe(400);

    await signup(app, 'resetter3');
    await api(app).post('/api/auth/forgot', { email: 'resetter3@example.com' });
    const token = tokenFrom(outbox[0]!.text);
    await app.ctx.db.prepare('UPDATE password_resets SET expires_at = ?').run(Date.now() - 1000);
    const expired = await api(app).post('/api/auth/reset-password', { token, password: 'brandNew123' });
    expect(expired.statusCode).toBe(400);
  });

  it('does not send a second email within a minute, and stores only a hash of the token', async () => {
    await signup(app, 'resetter4');
    await api(app).post('/api/auth/forgot', { email: 'resetter4@example.com' });
    await api(app).post('/api/auth/forgot', { email: 'resetter4@example.com' });
    expect(outbox).toHaveLength(1);
    const token = tokenFrom(outbox[0]!.text);
    const rows = (await app.ctx.db.prepare('SELECT token_hash FROM password_resets').pluck().all()) as string[];
    expect(rows).not.toContain(token);
  });
});
