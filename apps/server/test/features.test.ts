import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';
import { promptForDate } from '../src/lib/catalog.js';
import { purgeExpired } from '../src/db.js';

let app: FastifyInstance;
let a: TestUser, b: TestUser;
beforeAll(async () => {
  app = await makeApp();
  a = await signup(app, 'moodya', { interests: ['Coffee', 'Books'], traits: { social: 20, rhythm: 10, mind: 80 }, onboarded: true });
  b = await signup(app, 'moodyb', { interests: ['Coffee'], traits: { social: 25, rhythm: 90, mind: 75 }, onboarded: true });
});
afterAll(() => app.close());

describe('new features', () => {
  it('moods: stored, validated, filterable, pulse', async () => {
    const p = (await api(app, a).post('/api/posts', { content: 'sunny', mood: 'glow' })).json().post;
    expect(p.mood).toBe('glow');
    expect((await api(app, a).post('/api/posts', { content: 'x', mood: 'nope' })).statusCode).toBe(400);
    await api(app, a).post('/api/posts', { content: 'rainy', mood: 'heavy' });
    const f = (await api(app, b).get('/api/feed/foryou?mood=glow')).json().items;
    expect(f.map((i: { post: { content: string } }) => i.post.content)).toEqual(['sunny']);
    const pulse = (await api(app).get('/api/feed/pulse')).json();
    expect(pulse.total).toBe(2);
  });

  it('fading posts expire and are purged', async () => {
    const p = (await api(app, a).post('/api/posts', { content: 'gone soon', fade: true })).json().post;
    expect(p.expiresAt).toBeGreaterThan(Date.now() + 23 * 3600_000);
    await app.ctx.db.prepare('UPDATE posts SET expires_at = ? WHERE id = ?').run(Date.now() - 1, p.id);
    expect((await api(app, b).get(`/api/posts/${p.id}`)).statusCode).toBe(404);
    expect(await purgeExpired(app.ctx.db)).toBe(1);
  });

  it('daily prompt answers', async () => {
    const key = promptForDate().key;
    const before = (await api(app, a).get('/api/feed/prompt')).json();
    expect(before.prompt.key).toBe(key);
    expect(before.prompt.answered).toBe(false);
    await api(app, a).post('/api/posts', { content: 'my answer', promptKey: key });
    expect((await api(app, a).post('/api/posts', { content: 'old', promptKey: '2001-01-01' })).statusCode).toBe(400);
    const after = (await api(app, a).get('/api/feed/prompt')).json();
    expect(after.prompt.answered).toBe(true);
    expect(after.prompt.answers).toBe(1);
    expect(after.items[0].post.promptKey).toBe(key);
  });

  it('whispers feed only has anonymous posts with hidden authors', async () => {
    await api(app, a).post('/api/posts', { content: 'a whisper', isAnonymous: true, mood: 'tender' });
    const w = (await api(app, b).get('/api/feed/whispers')).json().items;
    expect(w).toHaveLength(1);
    expect(w[0].post.author).toBeNull();
    expect(w[0].post.content).toBe('a whisper');
  });

  it('vibe check exposes closeness, not raw values', async () => {
    const v = (await api(app, a).get('/api/users/moodyb/vibe')).json().vibe;
    expect(v.sharedInterests).toEqual(['Coffee']);
    const rhythm = v.traits.find((t: { key: string }) => t.key === 'rhythm');
    expect(rhythm.closeness).toBe(20);
    expect(JSON.stringify(v)).not.toMatch(/"(me|them|value)"/);
    const m = (await api(app, a).get('/api/connect')).json().matches[0];
    expect(m.vibe.length).toBe(3);
    expect((await api(app, a).get('/api/meta')).json().moods.length).toBe(8);
  });
});
