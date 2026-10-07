import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let ana: TestUser, ben: TestUser, cai: TestUser;
beforeAll(async () => {
  app = await makeApp();
  ana = await signup(app, 'ana_hist');
  ben = await signup(app, 'ben_hist');
  cai = await signup(app, 'cai_hist');
});
afterAll(() => app.close());

const create = async (u: TestUser, body: object) => (await api(app, u).post('/api/posts', body)).json().post;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('edit history', () => {
  it('keeps every earlier version, newest first, and marks the current one', async () => {
    const p = await create(ana, { content: 'version one' });
    expect((await api(app, ben).get(`/api/posts/${p.id}/history`)).json()).toMatchObject({ edited: false, versions: [{ content: 'version one', current: true }] });

    await sleep(5);
    expect((await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'version two' })).statusCode).toBe(200);
    await sleep(5);
    expect((await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'version three' })).statusCode).toBe(200);

    const h = (await api(app, ben).get(`/api/posts/${p.id}/history`)).json();
    expect(h.edited).toBe(true);
    expect(h.complete).toBe(true);
    expect(h.versions.map((v: { content: string }) => v.content)).toEqual(['version three', 'version two', 'version one']);
    expect(h.versions.map((v: { current: boolean }) => v.current)).toEqual([true, false, false]);
    const times = h.versions.map((v: { at: number }) => v.at);
    expect(times[0]).toBeGreaterThan(times[1]);
    expect(times[1]).toBeGreaterThan(times[2]);
    expect(times[2]).toBe(p.createdAt); // the original version started when the post was created
  });

  it('does not count a save without changes as an edit', async () => {
    const p = await create(ana, { content: 'same text' });
    const res = await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'same text' });
    expect(res.statusCode).toBe(200);
    expect(res.json().post.editedAt).toBeNull();
    expect((await api(app, ana).get(`/api/posts/${p.id}/history`)).json().edited).toBe(false);
  });

  it('only the author can edit, and history follows the same visibility as the post', async () => {
    const p = await create(ana, { content: 'private-ish' });
    expect((await api(app, ben).patch(`/api/posts/${p.id}`, { content: 'hijack' })).statusCode).toBe(403);
    await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'private-ish 2' });

    // blocked users cannot read it
    await api(app, ana).post(`/api/users/${cai.username}/block`);
    expect((await api(app, cai).get(`/api/posts/${p.id}/history`)).statusCode).toBe(404);
    // logged-out visitors can read public posts' history
    expect((await api(app).get(`/api/posts/${p.id}/history`)).statusCode).toBe(200);

    // private account: non-followers get 404
    await api(app, ana).patch('/api/me', { isPrivate: true });
    expect((await api(app, ben).get(`/api/posts/${p.id}/history`)).statusCode).toBe(404);
    expect((await api(app, ana).get(`/api/posts/${p.id}/history`)).statusCode).toBe(200);
    await api(app, ana).patch('/api/me', { isPrivate: false });
  });

  it('never reveals who wrote an anonymous post', async () => {
    const w = await create(ana, { content: 'secret one', isAnonymous: true });
    await api(app, ana).patch(`/api/posts/${w.id}`, { content: 'secret two' });
    const res = await api(app, ben).get(`/api/posts/${w.id}/history`);
    expect(res.statusCode).toBe(200);
    expect(res.json().versions).toHaveLength(2);
    expect(res.body).not.toContain(ana.id);
    expect(res.body).not.toContain('ana_hist');
  });

  it('removes the history with the post, and hides history of faded posts', async () => {
    const p = await create(ana, { content: 'to delete' });
    await api(app, ana).patch(`/api/posts/${p.id}`, { content: 'to delete 2' });
    expect((await app.ctx.db.prepare('SELECT COUNT(*) FROM post_edits WHERE post_id = ?').pluck().get(p.id)) as number).toBe(1);
    await api(app, ana).del(`/api/posts/${p.id}`);
    expect((await app.ctx.db.prepare('SELECT COUNT(*) FROM post_edits WHERE post_id = ?').pluck().get(p.id)) as number).toBe(0);
    expect((await api(app, ben).get(`/api/posts/${p.id}/history`)).statusCode).toBe(404);

    const f = await create(ana, { content: 'fading', fade: true });
    await api(app, ana).patch(`/api/posts/${f.id}`, { content: 'fading 2' });
    await app.ctx.db.prepare('UPDATE posts SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, f.id);
    expect((await api(app, ben).get(`/api/posts/${f.id}/history`)).statusCode).toBe(404);
  });
});
