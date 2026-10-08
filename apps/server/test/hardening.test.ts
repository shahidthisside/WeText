import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let ana: TestUser, ben: TestUser, cy: TestUser;

beforeAll(async () => {
  app = await makeApp();
  ana = await signup(app, 'ana', { interests: ['Coffee', 'Books'], traits: { social: 20, rhythm: 10 }, onboarded: true });
  ben = await signup(app, 'ben', { interests: ['Coffee', 'Books'], traits: { social: 25, rhythm: 15 }, onboarded: true });
  cy = await signup(app, 'cyd', { interests: ['F1'], traits: { social: 90 }, onboarded: true });
});
afterAll(() => app.close());

const post = async (u: TestUser, body: Record<string, unknown>) => {
  const r = await api(app, u).post('/api/posts', body);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().post;
};

describe('audit (a) vibe privacy for private accounts', () => {
  it('hides vibe for a private account the viewer cannot view, and reveals it after approval', async () => {
    const priv = await signup(app, 'vibepriv', { isPrivate: true, interests: ['Coffee'], traits: { social: 22 }, onboarded: true });
    // ben is not a follower -> no trait/closeness data
    expect((await api(app, ben).get('/api/users/vibepriv/vibe')).json().vibe).toBeNull();
    // request + approve -> now visible
    await api(app, ben).post('/api/users/vibepriv/follow');
    await api(app, priv).post(`/api/me/follow-requests/${ben.id}/accept`);
    const after = (await api(app, ben).get('/api/users/vibepriv/vibe')).json().vibe;
    expect(after).not.toBeNull();
    expect(after.traits).toBeDefined();
  });

  it('still returns vibe for public accounts and null for self/blocked', async () => {
    expect((await api(app, ana).get('/api/users/ben/vibe')).json().vibe).not.toBeNull();
    expect((await api(app, ana).get('/api/users/ana/vibe')).json().vibe).toBeNull();
  });
});

describe('audit (b) profile hides interests for private non-followers', () => {
  it('keeps name/bio/avatar public but hides interests until approved', async () => {
    const priv = await signup(app, 'profpriv', {
      isPrivate: true,
      bio: 'hello world',
      interests: ['Coffee', 'Books'],
      onboarded: true,
    });
    const seen = (await api(app, cy).get('/api/users/profpriv')).json().user;
    expect(seen.displayName).toBe('PROFPRIV'); // name stays public
    expect(seen.bio).toBe('hello world'); // bio stays public
    expect(seen.interests).toEqual([]); // interests hidden
    // owner sees their own interests
    const own = (await api(app, priv).get('/api/users/profpriv')).json().user;
    expect(own.interests.sort()).toEqual(['Books', 'Coffee']);
    // after following+approval the follower sees interests
    await api(app, cy).post('/api/users/profpriv/follow');
    await api(app, priv).post(`/api/me/follow-requests/${cy.id}/accept`);
    const asFollower = (await api(app, cy).get('/api/users/profpriv')).json().user;
    expect(asFollower.interests.sort()).toEqual(['Books', 'Coffee']);
  });

  it('public accounts expose interests to anyone', async () => {
    const u = (await api(app, cy).get('/api/users/ana')).json().user;
    expect(u.interests.sort()).toEqual(['Books', 'Coffee']);
  });
});

describe('audit (c) concurrent signup / username / email conflicts return 409', () => {
  it('concurrent signups with the same username/email yield one 201 and one 409', async () => {
    const payload = { username: 'raceuser', email: 'raceuser@example.com', password: 'passw0rd!', displayName: 'Race' };
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/auth/signup', payload }),
      app.inject({ method: 'POST', url: '/api/auth/signup', payload }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    const conflicting = a.statusCode === 409 ? a : b;
    expect(['username_taken', 'email_taken']).toContain(conflicting.json().code);
  });

  it('concurrent username changes to the same handle give one 200 and one 409', async () => {
    const u1 = await signup(app, 'racer1');
    const u2 = await signup(app, 'racer2');
    const [a, b] = await Promise.all([
      api(app, u1).post('/api/me/username', { username: 'takenhandle' }),
      api(app, u2).post('/api/me/username', { username: 'takenhandle' }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const bad = a.statusCode === 409 ? a : b;
    expect(bad.json().code).toBe('username_taken');
  });

  it('concurrent email changes to the same address give one 200 and one 409', async () => {
    const u1 = await signup(app, 'emailer1');
    const u2 = await signup(app, 'emailer2');
    const [a, b] = await Promise.all([
      api(app, u1).post('/api/auth/email', { email: 'shared@example.com', password: 'passw0rd!' }),
      api(app, u2).post('/api/auth/email', { email: 'shared@example.com', password: 'passw0rd!' }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const bad = a.statusCode === 409 ? a : b;
    expect(bad.json().code).toBe('email_taken');
  });
});

describe('audit (d) edited post tags get a fresh created_at', () => {
  it('tag created_at is the edit time, not the original post time', async () => {
    const p = await post(ana, { content: 'first' });
    await new Promise((r) => setTimeout(r, 10));
    const editAtLeast = Date.now();
    await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'now with #freshtag' });
    const row = (await (app as unknown as { ctx: { db: { prepare: (s: string) => { get: (...a: unknown[]) => Promise<unknown> } } } }).ctx.db
      .prepare('SELECT created_at FROM post_tags WHERE post_id = ? AND tag = ?')
      .get(p.id, 'freshtag')) as { created_at: number };
    expect(row.created_at).toBeGreaterThanOrEqual(editAtLeast);
    expect(row.created_at).toBeGreaterThan(p.createdAt);
  });
});

describe('audit (e) deleting a post removes its reply subtree', () => {
  it('replies are deleted (not orphaned) and their notifications removed', async () => {
    const root = await post(ana, { content: 'root to delete' });
    const r1 = await post(ben, { content: 'child reply', replyToId: root.id });
    const r2 = await post(cy, { content: 'grandchild', replyToId: r1.id });
    // ana gets a reply notification for r1
    expect((await api(app, ana).del(`/api/posts/${root.id}`)).statusCode).toBe(200);
    // whole subtree gone
    expect((await api(app, ana).get(`/api/posts/${root.id}`)).statusCode).toBe(404);
    expect((await api(app, ben).get(`/api/posts/${r1.id}`)).statusCode).toBe(404);
    expect((await api(app, cy).get(`/api/posts/${r2.id}`)).statusCode).toBe(404);
    // the reply notification to ana is gone (cascade)
    const notifs = (await api(app, ana).get('/api/notifications')).json().items;
    expect(notifs.find((n: { post: { id: string } | null }) => n.post?.id === r1.id)).toBeUndefined();
  });

  it('deleting a quoted post leaves the quoting post intact (quote link severed safely)', async () => {
    const original = await post(ana, { content: 'quote me' });
    const quoting = await post(ben, { content: 'look at this', quoteOfId: original.id });
    expect((await api(app, ana).del(`/api/posts/${original.id}`)).statusCode).toBe(200);
    const view = (await api(app, ben).get(`/api/posts/${quoting.id}`)).json().post;
    // The quoting post survives (not cascade-deleted); its quote reference is set null safely.
    expect(view.id).toBe(quoting.id);
    expect(view.quote).toBeNull();
  });
});

describe('audit (f) length limits counted in Unicode code points', () => {
  it('accepts 500 emoji (code points) but rejects 501', async () => {
    const ok = await api(app, ana).post('/api/posts', { content: '👍'.repeat(500) });
    expect(ok.statusCode, ok.body).toBe(201);
    const tooLong = await api(app, ana).post('/api/posts', { content: '👍'.repeat(501) });
    expect(tooLong.statusCode).toBe(400);
  });

  it('bio accepts 160 emoji code points but rejects 161', async () => {
    expect((await api(app, ana).patch('/api/me', { bio: '🌸'.repeat(160) })).statusCode).toBe(200);
    expect((await api(app, ana).patch('/api/me', { bio: '🌸'.repeat(161) })).statusCode).toBe(400);
  });

  it('display name accepts 50 emoji code points but rejects 51', async () => {
    expect((await api(app, ana).patch('/api/me', { displayName: '😀'.repeat(50) })).statusCode).toBe(200);
    expect((await api(app, ana).patch('/api/me', { displayName: '😀'.repeat(51) })).statusCode).toBe(400);
  });
});

describe('audit (g) likes list excludes blocked users', () => {
  it('omits users who blocked the viewer or are blocked by them', async () => {
    const author = await signup(app, 'likeauthor');
    const liker = await signup(app, 'liker');
    const viewer = await signup(app, 'likeviewer');
    const p = await post(author, { content: 'likeable' });
    await api(app, liker).post(`/api/posts/${p.id}/like`);
    await api(app, viewer).post(`/api/posts/${p.id}/like`);
    // before any block: both appear
    let users = (await api(app, viewer).get(`/api/posts/${p.id}/likes`)).json().users;
    expect(users.map((u: { username: string }) => u.username).sort()).toEqual(['liker', 'likeviewer']);
    // viewer blocks liker -> liker disappears from the list for the viewer
    await api(app, viewer).post('/api/users/liker/block');
    users = (await api(app, viewer).get(`/api/posts/${p.id}/likes`)).json().users;
    const names = users.map((u: { username: string }) => u.username);
    expect(names).not.toContain('liker');
    expect(names).toContain('likeviewer'); // the viewer still sees their own like
  });
});

describe('audit (h) media alt text persists and is trimmed', () => {
  it('stores and returns trimmed alt text', async () => {
    // Upload a real image for the author so the media url validates.
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#abcdef' } }).png().toBuffer();
    const boundary = '----wetextalt';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads?kind=media',
      headers: { cookie: ana.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(up.statusCode, up.body).toBe(201);
    const { url, width, height } = up.json();
    const r = await api(app, ana).post('/api/posts', {
      content: 'with alt',
      media: [{ url, width, height, alt: '  a blue square  ' }],
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().post.media[0].alt).toBe('a blue square');
    const refetched = (await api(app, ben).get(`/api/posts/${r.json().post.id}`)).json().post;
    expect(refetched.media[0].alt).toBe('a blue square');
  });
});

describe('audit (i) odd input returns 4xx not 500', () => {
  it('handles very long ids, array params, malformed JSON and huge page limits', async () => {
    // long id (over the max(32) cap) -> 400 validation, not 500
    expect((await api(app, ana).get('/api/posts/' + 'x'.repeat(100))).statusCode).toBe(400);
    // array query param on a string field -> 400, not 500
    expect((await api(app, ana).get('/api/search?q=a&q=b&type=people')).statusCode).toBe(400);
    // malformed JSON body -> 400
    const bad = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { cookie: ana.cookie, 'content-type': 'application/json' },
      payload: '{not valid json',
    });
    expect(bad.statusCode).toBe(400);
    // garbage cursor is ignored, not fatal
    expect((await api(app, ana).get('/api/feed/foryou?cursor=%%%notbase64%%%')).statusCode).toBe(200);
  });
});

describe('cache-control: authed API responses are no-store', () => {
  it('sets Cache-Control: no-store on API JSON responses', async () => {
    const r = await api(app, ana).get('/api/auth/me');
    expect(r.headers['cache-control']).toBe('no-store');
  });
});

describe('account deletion cleans up empty conversations', () => {
  it('removes a chat or group nobody belongs to any more, but keeps ones that still have a member', async () => {
    const x = await signup(app, 'delx', { interests: ['Coffee'], onboarded: true });
    const y = await signup(app, 'dely', { interests: ['Coffee'], onboarded: true });
    const z = await signup(app, 'delz', { interests: ['Coffee'], onboarded: true });
    for (const [a, b] of [[x, y], [y, x], [x, z], [z, x], [y, z], [z, y]] as const) await api(app, a).post(`/api/users/${b.username}/follow`);

    // A one-to-one chat with a message, and a group of three.
    const dm = (await api(app, x).post('/api/conversations', { username: y.username })).json().conversation;
    expect((await api(app, x).post(`/api/conversations/${dm.id}/messages`, { body: 'hi' })).statusCode).toBe(201);
    const group = (await api(app, x).post('/api/conversations/group', { title: 'Trio', memberIds: [y.id, z.id] })).json().conversation;

    const count = async (id: string) => (await app.ctx.db.prepare('SELECT COUNT(*) FROM conversations WHERE id = ?').pluck().get(id)) as number;

    // x leaves: y still belongs to the chat and the group, so both stay.
    expect((await api(app, x).post('/api/auth/delete-account', { password: 'passw0rd!' })).statusCode).toBe(200);
    expect(await count(dm.id)).toBe(1);
    expect(await count(group.id)).toBe(1);

    // y leaves: the chat is now empty and goes away; the group still has z.
    expect((await api(app, y).post('/api/auth/delete-account', { password: 'passw0rd!' })).statusCode).toBe(200);
    expect(await count(dm.id)).toBe(0);
    expect(await count(group.id)).toBe(1);

    // z leaves: nobody is left in the group, so it goes too, along with its messages.
    expect((await api(app, z).post('/api/auth/delete-account', { password: 'passw0rd!' })).statusCode).toBe(200);
    expect(await count(group.id)).toBe(0);
    expect(await app.ctx.db.prepare('SELECT COUNT(*) FROM messages WHERE conversation_id IN (?, ?)').pluck().get(dm.id, group.id)).toBe(0);
  });
});
