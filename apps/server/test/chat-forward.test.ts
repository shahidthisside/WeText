import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';
import { MESSAGE_REACTIONS } from '../src/services/chat.js';

let app: FastifyInstance;
let a: TestUser, b: TestUser, c: TestUser;

beforeAll(async () => {
  app = await makeApp();
  a = await signup(app, 'fwa');
  b = await signup(app, 'fwb');
  c = await signup(app, 'fwc');
});
afterAll(async () => {
  await app.close();
});

async function conv(me: TestUser, otherUsername: string): Promise<string> {
  return (await api(app, me).post('/api/conversations', { username: otherUsername })).json().conversation.id;
}
async function send(me: TestUser, convId: string, body: Record<string, unknown>) {
  return api(app, me).post(`/api/conversations/${convId}/messages`, body);
}

describe('forwarding (point 4)', () => {
  it('forwards a message into other conversations and reports failures', async () => {
    const ab = await conv(a, 'fwb');
    const ac = await conv(a, 'fwc');
    const m = (await send(a, ab, { body: 'forward me' })).json().message;

    // Forward into ac (ok) and a bogus conversation (fail).
    const r = await api(app, a).post(`/api/messages/${m.id}/forward`, { conversationIds: [ac, 'nonexistent123'] });
    expect(r.statusCode).toBe(200);
    expect(r.json().sent).toBe(1);
    expect(r.json().failed).toHaveLength(1);
    expect(r.json().failed[0].conversationId).toBe('nonexistent123');

    const acMsgs = (await api(app, a).get(`/api/conversations/${ac}/messages`)).json();
    const forwarded = acMsgs.items.find((x: { body: string }) => x.body === 'forward me');
    expect(forwarded.forwarded).toBe(true);
    expect(forwarded.replyTo).toBeNull();
  });

  it('reports a blocked target as failed', async () => {
    const u1 = await signup(app, 'fwblka');
    const u2 = await signup(app, 'fwblkb');
    const u3 = await signup(app, 'fwblkc');
    const src = await conv(u1, u2.username);
    const m = (await send(u1, src, { body: 'secret' })).json().message;
    const target = await conv(u1, u3.username);
    await api(app, u3).post(`/api/users/${u1.username}/block`);
    const r = await api(app, u1).post(`/api/messages/${m.id}/forward`, { conversationIds: [target] });
    expect(r.json().sent).toBe(0);
    expect(r.json().failed[0].reason).toBe('blocked');
  });

  it('refuses to forward a deleted message', async () => {
    const ab = await conv(a, 'fwb');
    const ac = await conv(a, 'fwc');
    const m = (await send(a, ab, { body: 'gone' })).json().message;
    await api(app, a).del(`/api/messages/${m.id}`);
    expect((await api(app, a).post(`/api/messages/${m.id}/forward`, { conversationIds: [ac] })).statusCode).toBe(400);
  });

  it('validates conversationIds length (1..5)', async () => {
    const ab = await conv(a, 'fwb');
    const m = (await send(a, ab, { body: 'x' })).json().message;
    expect((await api(app, a).post(`/api/messages/${m.id}/forward`, { conversationIds: [] })).statusCode).toBe(400);
    expect(
      (await api(app, a).post(`/api/messages/${m.id}/forward`, { conversationIds: ['1', '2', '3', '4', '5', '6'] })).statusCode,
    ).toBe(400);
  });
});

describe('shared posts (message view)', () => {
  it('shares a visible note with content, author and media', async () => {
    const img = `${'d'.repeat(14)}.webp`;
    app.ctx.db
      .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(`${a.id}/${img}`, a.id, 'image/webp', Buffer.from([0x1]), Date.now());
    const post = (await api(app, a).post('/api/posts', { content: 'look at this', media: [{ url: `/uploads/${a.id}/${img}`, width: 5, height: 5 }] })).json()
      .post;
    const id = await conv(a, 'fwb');
    const m = (await send(a, id, { postId: post.id })).json().message;
    expect(m.sharedPost.available).toBe(true);
    expect(m.sharedPost.content).toBe('look at this');
    expect(m.sharedPost.author.username).toBe('fwa');
    expect(m.sharedPost.media.url).toBe(`/uploads/${a.id}/${img}`);
  });

  it('marks a deleted shared post as unavailable', async () => {
    const post = (await api(app, a).post('/api/posts', { content: 'will delete' })).json().post;
    const id = await conv(a, 'fwb');
    const m = (await send(a, id, { postId: post.id })).json().message;
    await api(app, a).del(`/api/posts/${post.id}`);
    const view = (await api(app, a).get(`/api/conversations/${id}/messages`)).json();
    const row = view.items.find((x: { id: string }) => x.id === m.id);
    // post_id is ON DELETE SET NULL, so a hard-deleted post drops the share entirely.
    expect(row.sharedPost).toEqual({ id: '', available: false });
  });

  it('marks a faded (expired) shared post as unavailable', async () => {
    const post = (await api(app, a).post('/api/posts', { content: 'fading note', fade: true })).json().post;
    const id = await conv(a, 'fwb');
    const m = (await send(a, id, { postId: post.id })).json().message;
    // Force the post to be expired but still present (post_id still references it).
    app.ctx.db.prepare('UPDATE posts SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, post.id);
    const view = (await api(app, a).get(`/api/conversations/${id}/messages`)).json();
    const row = view.items.find((x: { id: string }) => x.id === m.id);
    expect(row.sharedPost).toEqual({ id: post.id, available: false });
  });

  it('hides a shared post from a viewer who cannot see it (private, not followed)', async () => {
    // b is private; a shares b's post to c; c cannot see it.
    const priv = await signup(app, 'privsharer', { isPrivate: true });
    const post = (await api(app, priv).post('/api/posts', { content: 'private note' })).json().post;
    // a follows priv (gets accepted? private => pending). Make a follow active via accept.
    await api(app, a).post(`/api/users/${priv.username}/follow`);
    // accept the request so a can see & share.
    await api(app, priv).post(`/api/me/follow-requests/${a.id}/accept`);
    const idToC = await conv(a, 'fwc');
    const m = (await send(a, idToC, { postId: post.id })).json().message;
    // c does not follow priv -> unavailable to c.
    const cView = (await api(app, c).get(`/api/conversations/${idToC}/messages`)).json();
    const row = cView.items.find((x: { id: string }) => x.id === m.id);
    expect(row.sharedPost.available).toBe(false);
    // a (follows priv) sees it available.
    const aView = (await api(app, a).get(`/api/conversations/${idToC}/messages`)).json();
    expect(aView.items.find((x: { id: string }) => x.id === m.id).sharedPost.available).toBe(true);
  });

  it('rejects sharing a note the sender cannot see', async () => {
    const priv = await signup(app, 'privowner', { isPrivate: true });
    const post = (await api(app, priv).post('/api/posts', { content: 'hidden' })).json().post;
    const id = await conv(a, 'fwb');
    expect((await send(a, id, { postId: post.id })).statusCode).toBe(400);
  });
});

describe('reactions (point 11)', () => {
  it('exports exactly the expanded allowed set', () => {
    expect(MESSAGE_REACTIONS).toEqual(['❤️', '😂', '😮', '😢', '👍', '🙏', '🔥', '👎']);
  });

  it('accepts the new emojis and rejects unknown ones, one per user', async () => {
    const id = await conv(a, 'fwb');
    const m = (await send(a, id, { body: 'react to me' })).json().message;
    expect((await api(app, b).put(`/api/messages/${m.id}/reaction`, { emoji: '🙏' })).statusCode).toBe(200);
    // Replace reaction (still one per user).
    await api(app, b).put(`/api/messages/${m.id}/reaction`, { emoji: '👎' });
    const view = (await api(app, b).get(`/api/conversations/${id}/messages`)).json();
    const row = view.items.find((x: { id: string }) => x.id === m.id);
    const total = row.reactions.reduce((s: number, r: { userIds: string[] }) => s + r.userIds.length, 0);
    expect(total).toBe(1);
    expect(row.reactions[0].emoji).toBe('👎');
    // Unknown emoji rejected by zod.
    expect((await api(app, b).put(`/api/messages/${m.id}/reaction`, { emoji: '🎉' })).statusCode).toBe(400);
  });
});

describe('account deletion cascade (point 14)', () => {
  it('deleting a user removes their messages, stars and hidden rows and leaves no crash', async () => {
    const x = await signup(app, 'delx');
    const y = await signup(app, 'dely');
    const id = await conv(x, y.username);
    const m = (await send(x, id, { body: 'from x' })).json().message;
    const my = (await send(y, id, { body: 'from y' })).json().message;
    await api(app, y).put(`/api/messages/${m.id}/star`, { starred: true });
    await api(app, y).post(`/api/messages/${my.id}/hide`);
    // y shares one of x's posts, then x is deleted.
    const post = (await api(app, x).post('/api/posts', { content: 'xs note' })).json().post;
    const yx = await conv(y, x.username);
    const shared = (await send(y, yx, { postId: post.id })).json().message;

    // Delete x's account.
    const del = await api(app, x).post('/api/auth/delete-account', { password: 'passw0rd!' });
    expect(del.statusCode).toBe(200);

    // x's messages are gone; y's conversation with x still loads without crashing.
    const yList = (await api(app, y).get('/api/conversations?tab=primary')).json();
    expect(yList.items).toBeDefined();
    // The shared post (whose author x is deleted) does not crash the view.
    const yxView = (await api(app, y).get(`/api/conversations/${yx}/messages`)).json();
    const row = yxView.items.find((r: { id: string }) => r.id === shared.id);
    // post_id SET NULL on author delete OR post deleted via cascade -> sharedPost null or unavailable, never a 500.
    expect(row === undefined || row.sharedPost === null || row.sharedPost.available === false).toBe(true);

    // No orphaned stars/hidden rows referencing x.
    const orphanStars = (await app.ctx.db.prepare('SELECT COUNT(*) AS n FROM message_stars WHERE user_id = ?').get(x.id)) as { n: number };
    expect(orphanStars.n).toBe(0);
    const orphanHidden = (await app.ctx.db.prepare('SELECT COUNT(*) AS n FROM message_hidden WHERE user_id = ?').get(x.id)) as { n: number };
    expect(orphanHidden.n).toBe(0);
    const orphanMsgs = (await app.ctx.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?').get(x.id)) as { n: number };
    expect(orphanMsgs.n).toBe(0);
  });
});
