import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let ana: TestUser, ben: TestUser, cy: TestUser;

beforeAll(async () => {
  app = await makeApp();
  ana = await signup(app, 'ana', { interests: ['Coffee', 'Books', 'Hiking'], traits: { social: 20, rhythm: 10 }, onboarded: true });
  ben = await signup(app, 'ben', { interests: ['Coffee', 'Books'], traits: { social: 25, rhythm: 15 }, onboarded: true });
  cy = await signup(app, 'cyd', { interests: ['F1'], traits: { social: 95, rhythm: 90 }, onboarded: true });
});
afterAll(() => app.close());

const post = async (u: TestUser, body: Record<string, unknown>) => {
  const r = await api(app, u).post('/api/posts', body);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().post;
};

describe('posts & engagement', () => {
  it('creates a post with tags, likes, reposts, bookmarks and notifies', async () => {
    const p = await post(ana, { content: 'Morning #coffee and #Books with @ben' });
    expect(p.tags.sort()).toEqual(['books', 'coffee']);
    expect(p.author.username).toBe('ana');

    await api(app, ben).post(`/api/posts/${p.id}/like`);
    await api(app, ben).post(`/api/posts/${p.id}/like`); // idempotent
    await api(app, ben).post(`/api/posts/${p.id}/repost`);
    await api(app, ben).post(`/api/posts/${p.id}/bookmark`);

    const view = (await api(app, ben).get(`/api/posts/${p.id}`)).json().post;
    expect(view.counts.likes).toBe(1);
    expect(view.counts.reposts).toBe(1);
    expect(view.viewer).toEqual({ liked: true, reposted: true, bookmarked: true });

    const bm = (await api(app, ben).get('/api/me/bookmarks')).json();
    expect(bm.items.map((i: { post: { id: string } }) => i.post.id)).toContain(p.id);

    const notifs = (await api(app, ana).get('/api/notifications')).json().items;
    expect(notifs.map((n: { type: string }) => n.type).sort()).toEqual(['like', 'repost']);
    const benNotifs = (await api(app, ben).get('/api/notifications')).json().items;
    expect(benNotifs[0].type).toBe('mention');

    await api(app, ben).del(`/api/posts/${p.id}/like`);
    const after = (await api(app, ana).get('/api/notifications')).json().items;
    expect(after.map((n: { type: string }) => n.type)).toEqual(['repost']);
  });

  it('threads replies and shows ancestors', async () => {
    const root = await post(ana, { content: 'root' });
    const r1 = await post(ben, { content: 'reply 1', replyToId: root.id });
    const r2 = await post(ana, { content: 'reply 2', replyToId: r1.id });
    const thread = (await api(app, cy).get(`/api/posts/${r2.id}`)).json();
    expect(thread.ancestors.map((p: { id: string }) => p.id)).toEqual([root.id, r1.id]);
    expect(thread.post.replyTo.username).toBe('ben');
    const replies = (await api(app, cy).get(`/api/posts/${root.id}/replies`)).json();
    expect(replies.items.map((p: { id: string }) => p.id)).toEqual([r1.id]);
  });

  it('hides anonymous authors from everyone but the author', async () => {
    const p = await post(ana, { content: 'secret thought', isAnonymous: true });
    expect(p.author).not.toBeNull();
    expect(p.isMine).toBe(true);
    const asBen = (await api(app, ben).get(`/api/posts/${p.id}`)).json().post;
    expect(asBen.author).toBeNull();
    expect(asBen.isMine).toBe(false);
    // Not on the public profile
    const profile = (await api(app, ben).get('/api/users/ana/posts')).json().items;
    expect(profile.find((i: { post: { id: string } }) => i.post.id === p.id)).toBeUndefined();
    // An anonymous reply notifies without revealing the actor.
    await post(cy, { content: 'anon reply', replyToId: p.id, isAnonymous: true });
    const n = (await api(app, ana).get('/api/notifications')).json().items.find((x: { type: string }) => x.type === 'reply');
    expect(n.actors[0]).toBeNull();
  });

  it('enforces edit window, ownership and length', async () => {
    const p = await post(ana, { content: 'typo #tpyo' });
    expect((await api(app, ben).patch(`/api/posts/${p.id}`, { content: 'hack' })).statusCode).toBe(403);
    const edited = (await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'fixed #typo' })).json().post;
    expect(edited.editedAt).toBeTruthy();
    expect(edited.tags).toEqual(['typo']);
    expect((await api(app, ana).post('/api/posts', { content: 'x'.repeat(501) })).statusCode).toBe(400);
    expect((await api(app, ana).post('/api/posts', { content: '   ' })).statusCode).toBe(400);
    expect((await api(app, ben).del(`/api/posts/${p.id}`)).statusCode).toBe(403);
    expect((await api(app, ana).del(`/api/posts/${p.id}`)).statusCode).toBe(200);
  });

  it('runs polls: single vote per user, closed state', async () => {
    const p = await post(ana, { content: 'Tea or coffee?', poll: { options: ['Tea', 'Coffee'], durationHours: 24 } });
    expect(p.poll.options).toHaveLength(2);
    const opt = p.poll.options[1].id;
    const v = (await api(app, ben).post(`/api/posts/${p.id}/vote`, { optionId: opt })).json().post;
    expect(v.poll.myVote).toBe(opt);
    expect(v.poll.totalVotes).toBe(1);
    expect((await api(app, ben).post(`/api/posts/${p.id}/vote`, { optionId: opt })).statusCode).toBe(400);
  });

  it('quotes posts', async () => {
    const p = await post(ben, { content: 'quotable' });
    const q = await post(cy, { content: 'so true', quoteOfId: p.id });
    expect(q.quote.id).toBe(p.id);
    expect(q.quote.content).toBe('quotable');
  });
});

describe('social graph & privacy', () => {
  it('follow feed includes followed posts and reposts', async () => {
    await api(app, cy).post('/api/users/ben/follow');
    const own = await post(ben, { content: 'ben original for feed' });
    const feed = (await api(app, cy).get('/api/feed/following')).json().items;
    expect(feed.find((i: { post: { id: string } }) => i.post.id === own.id)).toBeTruthy();
    // ben reposted ana's first post earlier
    expect(feed.some((i: { repostedBy: { username: string } | null }) => i.repostedBy?.username === 'ben')).toBe(true);
  });

  it('private accounts require approval and hide posts', async () => {
    const priv = await signup(app, 'priv', { isPrivate: true, onboarded: true });
    const p = await post(priv, { content: 'for followers only' });
    expect((await api(app, ana).get(`/api/posts/${p.id}`)).statusCode).toBe(404);
    expect((await api(app, ana).post('/api/users/priv/follow')).json().status).toBe('pending');
    const reqs = (await api(app, priv).get('/api/me/follow-requests')).json().users;
    expect(reqs.map((u: { username: string }) => u.username)).toEqual(['ana']);
    await api(app, priv).post(`/api/me/follow-requests/${ana.id}/accept`);
    expect((await api(app, ana).get(`/api/posts/${p.id}`)).statusCode).toBe(200);
    // Cannot be reposted
    expect((await api(app, ana).post(`/api/posts/${p.id}/repost`)).statusCode).toBe(403);
  });

  it('blocking severs follows and hides content both ways', async () => {
    const x = await signup(app, 'xavier');
    const y = await signup(app, 'yara');
    await api(app, x).post('/api/users/yara/follow');
    await api(app, y).post('/api/users/xavier/follow');
    const p = await post(y, { content: 'yara post' });
    await api(app, x).post('/api/users/yara/block');
    expect((await api(app, x).get(`/api/posts/${p.id}`)).statusCode).toBe(404);
    expect((await api(app, y).post('/api/users/xavier/follow')).statusCode).toBe(400);
    const prof = (await api(app, y).get('/api/users/xavier')).json().user;
    expect(prof.viewer.blockedBy).toBe(true);
    expect(prof.followersCount).toBe(0);
    expect((await api(app, x).get('/api/me/blocks')).json().users[0].username).toBe('yara');
  });

  it('for-you feed works logged out and ranks', async () => {
    const r = await api(app).get('/api/feed/foryou');
    expect(r.statusCode).toBe(200);
    expect(r.json().items.length).toBeGreaterThan(0);
    expect(r.json().items.every((i: { post: { replyTo: unknown } }) => i.post.replyTo === null)).toBe(true);
  });
});

describe('discovery', () => {
  it('search finds posts, people and tags', async () => {
    const s = (await api(app, ana).get('/api/search?q=quotable')).json();
    expect(s.items.length).toBeGreaterThan(0);
    const people = (await api(app, ana).get('/api/search?q=be&type=people')).json();
    expect(people.users.map((u: { username: string }) => u.username)).toContain('ben');
    const tag = (await api(app, ana).get('/api/search?q=%23coffee')).json();
    expect(tag.items.length).toBeGreaterThan(0);
    const weird = await api(app, ana).get('/api/search?q=' + encodeURIComponent('"AND OR * ('));
    expect(weird.statusCode).toBe(200);
  });

  it('trending returns tags', async () => {
    const t = (await api(app).get('/api/trending')).json();
    expect(t.tags.map((x: { tag: string }) => x.tag)).toContain('coffee');
  });

  it('connect ranks compatible people higher and supports pass', async () => {
    const fresh = await signup(app, 'zoe', { interests: ['Coffee', 'Books', 'Hiking'], traits: { social: 22, rhythm: 12 }, onboarded: true });
    const m = (await api(app, fresh).get('/api/connect')).json().matches;
    const names = m.map((x: { user: { username: string } }) => x.user.username);
    expect(names.indexOf('ana')).toBeLessThan(names.indexOf('cyd'));
    const anaMatch = m.find((x: { user: { username: string } }) => x.user.username === 'ana');
    expect(anaMatch.score).toBeGreaterThan(90);
    expect(anaMatch.sharedInterests).toEqual(['Coffee', 'Books', 'Hiking']);
    expect(anaMatch.traitHighlights).toContain('Both homebodies');
    await api(app, fresh).post(`/api/connect/${ana.id}/pass`);
    const m2 = (await api(app, fresh).get('/api/connect')).json().matches;
    expect(m2.map((x: { user: { username: string } }) => x.user.username)).not.toContain('ana');
  });
});
