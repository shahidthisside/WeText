import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

describe('auth', () => {
  it('signs up, reads session, logs out', async () => {
    const u = await signup(app, 'alice');
    const me = await api(app, u).get('/api/auth/me');
    expect(me.json().user.username).toBe('alice');
    expect(me.json().user.email).toBe('alice@example.com');
    expect(me.json().user).not.toHaveProperty('password_hash');

    const out = await api(app, u).post('/api/auth/logout');
    expect(out.statusCode).toBe(200);
    const after = await api(app, u).get('/api/auth/me');
    expect(after.json().user).toBeNull();
  });

  it('rejects duplicate username (case-insensitive) and weak passwords', async () => {
    await signup(app, 'bob');
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { username: 'BOB', email: 'other@example.com', password: 'passw0rd!', displayName: 'B' },
    });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { username: 'carol', email: 'carol@example.com', password: 'short', displayName: 'C' },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error).toMatch(/password/);
  });

  it('logs in with username or email, rejects bad password', async () => {
    await signup(app, 'dave');
    const ok1 = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'dave', password: 'passw0rd!' } });
    expect(ok1.statusCode).toBe(200);
    const ok2 = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'DAVE@example.com', password: 'passw0rd!' } });
    expect(ok2.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'dave', password: 'wrong' } });
    expect(bad.statusCode).toBe(401);
  });

  it('lists and revokes sessions; password change signs out others', async () => {
    const u = await signup(app, 'erin');
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'erin', password: 'passw0rd!' } });
    const other = { ...u, cookie: (login.headers['set-cookie'] as string).split(';')[0]! };
    const list = await api(app, u).get('/api/auth/sessions');
    expect(list.json().sessions).toHaveLength(2);
    expect(list.json().sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const pw = await api(app, u).post('/api/auth/password', { currentPassword: 'passw0rd!', newPassword: 'newpassw0rd' });
    expect(pw.statusCode).toBe(200);
    expect((await api(app, other).get('/api/auth/me')).json().user).toBeNull();
    expect((await api(app, u).get('/api/auth/me')).json().user.username).toBe('erin');
  });

  it('blocks cross-origin mutations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { login: 'dave', password: 'passw0rd!' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('updates profile with validation and deletes account', async () => {
    const u = await signup(app, 'frank');
    const bad = await api(app, u).patch('/api/me', { interests: ['Not a real interest'] });
    expect(bad.statusCode).toBe(400);
    const ok = await api(app, u).patch('/api/me', {
      bio: 'hi there',
      website: 'example.com',
      interests: ['Coffee', 'Books'],
      traits: { social: 30 },
      onboarded: true,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.website).toBe('https://example.com');
    expect(ok.json().user.traits.social).toBe(30);

    const wrong = await api(app, u).post('/api/auth/delete-account', { password: 'nope' });
    expect(wrong.statusCode).toBe(400);
    const del = await api(app, u).post('/api/auth/delete-account', { password: 'passw0rd!' });
    expect(del.statusCode).toBe(200);
    expect((await api(app).get('/api/users/frank')).statusCode).toBe(404);
  });
});
