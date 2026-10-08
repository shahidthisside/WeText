import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let ana: TestUser, ben: TestUser, cy: TestUser;

beforeAll(async () => {
  app = await makeApp();
  ana = await signup(app, 'ana', { interests: ['Coffee'], traits: { social: 20 }, onboarded: true });
  ben = await signup(app, 'ben', { onboarded: true });
  cy = await signup(app, 'cyd', { onboarded: true });
});
afterAll(() => app.close());

const post = async (u: TestUser, body: Record<string, unknown>) => {
  const r = await api(app, u).post('/api/posts', body);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().post;
};

describe('reporting', () => {
  it('requires auth', async () => {
    const r = await api(app).post('/api/reports', { targetType: 'user', targetId: ben.id, reason: 'spam' });
    expect(r.statusCode).toBe(401);
  });

  it('reports a post and is idempotent per (reporter,type,target)', async () => {
    const p = await post(ben, { content: 'reportable post' });
    const first = await api(app, ana).post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam' });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ ok: true });
    // second call updates reason/details and still returns 200
    const second = await api(app, ana).post('/api/reports', {
      targetType: 'post',
      targetId: p.id,
      reason: 'abuse',
      details: 'changed my mind',
    });
    expect(second.statusCode).toBe(200);
  });

  it('reports a user', async () => {
    const r = await api(app, ana).post('/api/reports', { targetType: 'user', targetId: cy.id, reason: 'impersonation' });
    expect(r.statusCode, r.body).toBe(200);
  });

  it('rejects reporting yourself or your own post', async () => {
    expect((await api(app, ana).post('/api/reports', { targetType: 'user', targetId: ana.id, reason: 'spam' })).statusCode).toBe(400);
    const own = await post(ana, { content: 'my own post' });
    expect((await api(app, ana).post('/api/reports', { targetType: 'post', targetId: own.id, reason: 'spam' })).statusCode).toBe(400);
  });

  it('404s for a non-existent target and validates reason', async () => {
    expect((await api(app, ana).post('/api/reports', { targetType: 'post', targetId: 'doesnotexist', reason: 'spam' })).statusCode).toBe(404);
    expect((await api(app, ana).post('/api/reports', { targetType: 'user', targetId: 'nope', reason: 'spam' })).statusCode).toBe(404);
    // invalid reason -> 400 validation
    expect((await api(app, ana).post('/api/reports', { targetType: 'user', targetId: ben.id, reason: 'nonsense' })).statusCode).toBe(400);
  });

  it('message reports require conversation membership and reject your own message', async () => {
    // ana and ben start a conversation; cy is an outsider.
    const conv = (await api(app, ana).post('/api/conversations', { username: 'ben' })).json().conversation;
    const sent = await api(app, ana).post(`/api/conversations/${conv.id}/messages`, { body: 'hi ben' });
    expect(sent.statusCode).toBe(201);
    const msgId = sent.json().message.id;
    // ben is a member -> can report ana's message
    expect((await api(app, ben).post('/api/reports', { targetType: 'message', targetId: msgId, reason: 'abuse' })).statusCode).toBe(200);
    // ana is the sender -> cannot report her own message
    expect((await api(app, ana).post('/api/reports', { targetType: 'message', targetId: msgId, reason: 'abuse' })).statusCode).toBe(400);
    // cy is not a member -> forbidden
    expect((await api(app, cy).post('/api/reports', { targetType: 'message', targetId: msgId, reason: 'abuse' })).statusCode).toBe(403);
  });

  it('admin endpoint 404s when ADMIN_USERNAME is unset', async () => {
    // No ADMIN_USERNAME configured in the test env.
    expect((await api(app, ana).get('/api/admin/reports')).statusCode).toBe(404);
  });
});

describe('data export', () => {
  it('returns a downloadable JSON with the user\u2019s own data', async () => {
    const exporter = await signup(app, 'exporter', { interests: ['Books'], traits: { social: 30 }, onboarded: true });
    const normal = await post(exporter, { content: 'public post' });
    const whisper = await post(exporter, { content: 'anon whisper', isAnonymous: true });
    const fading = await post(exporter, { content: 'fades later', fade: true });
    await api(app, exporter).post(`/api/posts/${normal.id}/bookmark`);
    await api(app, exporter).post('/api/users/ana/follow');
    await api(app, ana).post('/api/users/exporter/follow');
    await api(app, exporter).post('/api/users/cyd/block');
    await api(app, exporter).post('/api/users/ben/mute');
    // a message to ana
    const conv = (await api(app, exporter).post('/api/conversations', { username: 'ana' })).json().conversation;
    await api(app, exporter).post(`/api/conversations/${conv.id}/messages`, { body: 'hello ana from exporter' });

    const r = await api(app, exporter).get('/api/me/export');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-disposition']).toContain('attachment');
    expect(r.headers['content-disposition']).toContain('wetext-exporter-export.json');
    const data = r.json();
    expect(data.profile.username).toBe('exporter');
    expect(data.interests).toEqual(['Books']);
    expect(data.traits.social).toBe(30);
    const postIds = data.posts.map((p: { id: string }) => p.id);
    expect(postIds).toContain(normal.id);
    expect(postIds).toContain(whisper.id); // whispers included
    expect(postIds).toContain(fading.id); // still-existing fading posts included
    expect(data.posts.find((p: { id: string; isAnonymous: boolean }) => p.id === whisper.id).isAnonymous).toBe(true);
    expect(data.bookmarks).toContain(normal.id);
    expect(data.following).toContain('ana');
    expect(data.followers).toContain('ana');
    expect(data.blocked).toContain('cyd');
    expect(data.muted).toContain('ben');
    const convExport = data.messages.find((m: { with: string }) => m.with === 'ana');
    expect(convExport).toBeDefined();
    expect(convExport.sent.map((m: { body: string }) => m.body)).toContain('hello ana from exporter');
  });

  it('requires auth', async () => {
    expect((await api(app).get('/api/me/export')).statusCode).toBe(401);
  });
});
