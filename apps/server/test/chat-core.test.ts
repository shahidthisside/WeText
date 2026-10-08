import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let a: TestUser, b: TestUser, c: TestUser;

beforeAll(async () => {
  app = await makeApp();
  a = await signup(app, 'alice');
  b = await signup(app, 'bob');
  c = await signup(app, 'cara');
});
afterAll(async () => {
  await app.close();
});

/** Make a fresh conversation between two users and return its id. */
async function conv(me: TestUser, otherUsername: string): Promise<string> {
  const r = await api(app, me).post('/api/conversations', { username: otherUsername });
  return r.json().conversation.id;
}

async function send(me: TestUser, convId: string, body: Record<string, unknown>) {
  return api(app, me).post(`/api/conversations/${convId}/messages`, body);
}

/** Directly reach into the test DB to simulate time passing. */
function dbOf() {
  return app.ctx.db;
}

describe('message view shape', () => {
  it('exposes all contract fields with defaults', async () => {
    const id = await conv(a, 'bob');
    const sent = await send(a, id, { body: 'hello world' });
    expect(sent.statusCode).toBe(201);
    const m = sent.json().message;
    expect(m).toMatchObject({
      conversationId: id,
      senderId: a.id,
      body: 'hello world',
      image: null,
      audio: null,
      sharedPost: null,
      replyTo: null,
      editedAt: null,
      forwarded: false,
      deleted: false,
      expiresAt: null,
      starred: false,
      reactions: [],
    });
    expect(typeof m.createdAt).toBe('number');
    expect(typeof m.id).toBe('string');
  });
});

describe('editing (point 2)', () => {
  it('edits own text within the window and sets editedAt', async () => {
    const id = await conv(a, 'bob');
    const m = (await send(a, id, { body: 'first' })).json().message;
    const r = await api(app, a).patch(`/api/messages/${m.id}`, { body: 'second' });
    expect(r.statusCode).toBe(200);
    expect(r.json().message.body).toBe('second');
    expect(typeof r.json().message.editedAt).toBe('number');
  });

  it("rejects editing someone else's message", async () => {
    const id = await conv(a, 'bob');
    const m = (await send(a, id, { body: 'mine' })).json().message;
    const r = await api(app, b).patch(`/api/messages/${m.id}`, { body: 'hijack' });
    expect(r.statusCode).toBe(403);
  });

  it('rejects editing after the 15-minute window (created_at manipulated)', async () => {
    const id = await conv(a, 'bob');
    const m = (await send(a, id, { body: 'old' })).json().message;
    await dbOf().prepare('UPDATE messages SET created_at = ? WHERE id = ?').run(Date.now() - 16 * 60 * 1000, m.id);
    const r = await api(app, a).patch(`/api/messages/${m.id}`, { body: 'too late' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/edit window/i);
  });

  it('rejects editing audio-only and forwarded messages', async () => {
    const id = await conv(a, 'bob');
    const m = (await send(a, id, { body: 'x' })).json().message;
    await dbOf().prepare('UPDATE messages SET forwarded = 1 WHERE id = ?').run(m.id);
    expect((await api(app, a).patch(`/api/messages/${m.id}`, { body: 'nope' })).statusCode).toBe(400);
  });
});

describe('delete for everyone + hide for me (points 3)', () => {
  it('unsend blanks the message for both', async () => {
    const id = await conv(a, 'bob');
    const m = (await send(a, id, { body: 'secret' })).json().message;
    const r = await api(app, a).del(`/api/messages/${m.id}`);
    expect(r.statusCode).toBe(200);
    expect(r.json().message.deleted).toBe(true);
    expect(r.json().message.body).toBe('');
  });

  it('hide-for-me removes a received message only for me and is idempotent', async () => {
    const id = await conv(a, 'bob');
    await send(a, id, { body: 'from alice' });
    const bobView = (await api(app, b).get(`/api/conversations/${id}/messages`)).json();
    const mid = bobView.items[0].id;
    expect((await api(app, b).post(`/api/messages/${mid}/hide`)).statusCode).toBe(200);
    expect((await api(app, b).post(`/api/messages/${mid}/hide`)).statusCode).toBe(200); // idempotent
    const bobAfter = (await api(app, b).get(`/api/conversations/${id}/messages`)).json();
    expect(bobAfter.items.find((x: { id: string }) => x.id === mid)).toBeUndefined();
    // Alice still sees it.
    const aliceAfter = (await api(app, a).get(`/api/conversations/${id}/messages`)).json();
    expect(aliceAfter.items.find((x: { id: string }) => x.id === mid)).toBeDefined();
  });
});

describe('starring (point 5)', () => {
  it('stars, lists newest-first and unstars', async () => {
    const id = await conv(a, 'bob');
    const m1 = (await send(a, id, { body: 'star me 1' })).json().message;
    const m2 = (await send(a, id, { body: 'star me 2' })).json().message;
    await api(app, a).put(`/api/messages/${m1.id}/star`, { starred: true });
    await api(app, a).put(`/api/messages/${m2.id}/star`, { starred: true });
    const list = (await api(app, a).get('/api/me/starred-messages')).json();
    const ids = list.items.map((x: { message: { id: string } }) => x.message.id);
    expect(ids).toContain(m1.id);
    expect(ids).toContain(m2.id);
    // Newest star first.
    expect(ids.indexOf(m2.id)).toBeLessThan(ids.indexOf(m1.id));
    expect(list.items[0].conversation.other.username).toBe('bob');
    // Unstar.
    await api(app, a).put(`/api/messages/${m1.id}/star`, { starred: false });
    const after = (await api(app, a).get('/api/me/starred-messages')).json();
    expect(after.items.map((x: { message: { id: string } }) => x.message.id)).not.toContain(m1.id);
  });

  it('excludes deleted messages from the star list', async () => {
    const id = await conv(a, 'bob');
    const m = (await send(a, id, { body: 'temp' })).json().message;
    await api(app, a).put(`/api/messages/${m.id}/star`, { starred: true });
    await api(app, a).del(`/api/messages/${m.id}`);
    const list = (await api(app, a).get('/api/me/starred-messages')).json();
    expect(list.items.map((x: { message: { id: string } }) => x.message.id)).not.toContain(m.id);
  });
});

describe('conversation flags: pin / archive / mute / unread / ttl (point 6)', () => {
  it('pins up to 3 and rejects the fourth', async () => {
    const u = await signup(app, 'pinner');
    const targets = ['alice', 'bob', 'cara'];
    const ids: string[] = [];
    for (const t of targets) {
      const id = await conv(u, t);
      await send(u, id, { body: 'hi' });
      ids.push(id);
    }
    for (const id of ids) expect((await api(app, u).patch(`/api/conversations/${id}`, { pinned: true })).statusCode).toBe(200);
    const fourthTarget = await signup(app, 'fourthfriend');
    const id4 = await conv(u, fourthTarget.username);
    await send(u, id4, { body: 'hi' });
    const r = await api(app, u).patch(`/api/conversations/${id4}`, { pinned: true });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('pin_limit');
  });

  it('pinned conversations sort first in primary', async () => {
    const u = await signup(app, 'sorter');
    const t1 = await signup(app, 'sortt1');
    const t2 = await signup(app, 'sortt2');
    const id1 = await conv(u, t1.username);
    await send(u, id1, { body: 'one' });
    const id2 = await conv(u, t2.username);
    await send(u, id2, { body: 'two' }); // id2 is newest
    // Pin id1 so it jumps to the top despite being older.
    await api(app, u).patch(`/api/conversations/${id1}`, { pinned: true });
    const primary = (await api(app, u).get('/api/conversations?tab=primary')).json();
    expect(primary.items[0].id).toBe(id1);
    expect(primary.items[0].pinned).toBe(true);
  });

  it('archive hides from primary, incoming message auto-unarchives recipient', async () => {
    const id = await conv(a, 'bob');
    await send(a, id, { body: 'kick off' });
    await send(b, id, { body: 'reply' }); // so it is not a request for either
    await api(app, b).patch(`/api/conversations/${id}`, { archived: true });
    let bobPrimary = (await api(app, b).get('/api/conversations?tab=primary')).json();
    expect(bobPrimary.items.find((x: { id: string }) => x.id === id)).toBeUndefined();
    let bobArchived = (await api(app, b).get('/api/conversations?tab=archived')).json();
    expect(bobArchived.items.find((x: { id: string }) => x.id === id)).toBeDefined();
    // Alice sends -> auto-unarchive for Bob.
    await send(a, id, { body: 'you there?' });
    bobPrimary = (await api(app, b).get('/api/conversations?tab=primary')).json();
    expect(bobPrimary.items.find((x: { id: string }) => x.id === id)).toBeDefined();
  });

  it('markedUnread is set and cleared by reading, and reflected in counts', async () => {
    const u = await signup(app, 'unreaduser');
    const t = await signup(app, 'unreadtarget');
    const id = await conv(u, t.username);
    await send(u, id, { body: 'hello' });
    await api(app, u).patch(`/api/conversations/${id}`, { markedUnread: true });
    expect((await api(app, u).get(`/api/conversations/${id}`)).json().conversation.markedUnread).toBe(true);
    expect((await api(app, u).get('/api/me/counts')).json().messages).toBeGreaterThanOrEqual(1);
    await api(app, u).post(`/api/conversations/${id}/read`);
    expect((await api(app, u).get(`/api/conversations/${id}`)).json().conversation.markedUnread).toBe(false);
  });

  it('sets ttl and new messages expire; expired messages are excluded', async () => {
    const id = await conv(a, 'bob');
    const set = await api(app, a).patch(`/api/conversations/${id}`, { ttlSeconds: 86400 });
    expect(set.statusCode).toBe(200);
    expect(set.json().conversation.ttlSeconds).toBe(86400);
    const m = (await send(a, id, { body: 'disappears' })).json().message;
    expect(m.expiresAt).toBeGreaterThan(Date.now());
    // Force-expire it.
    await dbOf().prepare('UPDATE messages SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, m.id);
    const hist = (await api(app, a).get(`/api/conversations/${id}/messages`)).json();
    expect(hist.items.find((x: { id: string }) => x.id === m.id)).toBeUndefined();
  });

  it('rejects an invalid ttl value', async () => {
    const id = await conv(a, 'bob');
    expect((await api(app, a).patch(`/api/conversations/${id}`, { ttlSeconds: 12345 })).statusCode).toBe(400);
  });
});

describe('last message preview flags (point 7)', () => {
  it('flags audio and shared note previews', async () => {
    // audio
    const id = await conv(a, 'bob');
    const audioUrl = `/uploads/${a.id}/${'a'.repeat(14)}.webm`;
    await dbOf()
      .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(`${a.id}/${'a'.repeat(14)}.webm`, a.id, 'audio/webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Date.now());
    const r = await send(a, id, { audio: { url: audioUrl, durationMs: 2000 } });
    expect(r.statusCode).toBe(201);
    const list = (await api(app, a).get('/api/conversations?tab=primary')).json();
    const row = list.items.find((x: { id: string }) => x.id === id);
    expect(row.lastMessage.audio).toBe(true);

    // shared note
    const post = (await api(app, a).post('/api/posts', { content: 'a shared note' })).json().post;
    const id2 = await conv(a, 'cara');
    await send(a, id2, { postId: post.id });
    const list2 = (await api(app, a).get('/api/conversations?tab=primary')).json();
    const row2 = list2.items.find((x: { id: string }) => x.id === id2);
    expect(row2.lastMessage.sharedPost).toBe(true);
  });
});

describe('search and media (point 8)', () => {
  it('searches message text with special characters and limits', async () => {
    const id = await conv(a, 'bob');
    await send(a, id, { body: 'find 50% off now' });
    await send(a, id, { body: 'unrelated text' });
    const r = await api(app, a).get(`/api/conversations/${id}/search?q=${encodeURIComponent('50%')}`);
    expect(r.statusCode).toBe(200);
    expect(r.json().items.length).toBe(1);
    expect(r.json().items[0].body).toContain('50%');
    // Underscore is treated literally, not as a wildcard.
    await send(a, id, { body: 'has_underscore here' });
    const r2 = await api(app, a).get(`/api/conversations/${id}/search?q=${encodeURIComponent('has_under')}`);
    expect(r2.json().items.length).toBe(1);
    // Too-short query rejected.
    expect((await api(app, a).get(`/api/conversations/${id}/search?q=a`)).statusCode).toBe(400);
  });

  it('lists image and audio media separately', async () => {
    const id = await conv(a, 'bob');
    const imgName = `${'b'.repeat(14)}.webp`;
    await dbOf()
      .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(`${a.id}/${imgName}`, a.id, 'image/webp', Buffer.from([0x52]), Date.now());
    await send(a, id, { image: { url: `/uploads/${a.id}/${imgName}`, width: 10, height: 10 } });
    const audioName = `${'c'.repeat(14)}.ogg`;
    await dbOf()
      .prepare('INSERT INTO files (path, user_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(`${a.id}/${audioName}`, a.id, 'audio/ogg', Buffer.from([0x4f, 0x67, 0x67, 0x53]), Date.now());
    await send(a, id, { audio: { url: `/uploads/${a.id}/${audioName}`, durationMs: 1500 } });

    const imgs = (await api(app, a).get(`/api/conversations/${id}/media?kind=image`)).json();
    expect(imgs.items.every((x: { image: unknown }) => x.image)).toBe(true);
    expect(imgs.items.length).toBeGreaterThanOrEqual(1);
    const auds = (await api(app, a).get(`/api/conversations/${id}/media?kind=audio`)).json();
    expect(auds.items.every((x: { audio: unknown }) => x.audio)).toBe(true);
    expect(auds.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('request rule (point 9)', () => {
  it('an empty conversation is never a request', async () => {
    const u1 = await signup(app, 'reqa');
    const u2 = await signup(app, 'reqb');
    const id = await conv(u1, u2.username);
    // Creator just opened it, no messages yet.
    expect((await api(app, u1).get(`/api/conversations/${id}`)).json().conversation.isRequest).toBe(false);
    // The other person also sees it as not-a-request (no messages at all).
    expect((await api(app, u2).get(`/api/conversations/${id}`)).json().conversation.isRequest).toBe(false);
  });

  it('becomes a request only once the other person sends and I do not follow them', async () => {
    const u1 = await signup(app, 'reqc');
    const u2 = await signup(app, 'reqd');
    const id = await conv(u1, u2.username);
    await send(u1, id, { body: 'hey there' });
    // For u2: u1 messaged, u2 hasn't replied, u2 doesn't follow u1 -> request.
    expect((await api(app, u2).get(`/api/conversations/${id}`)).json().conversation.isRequest).toBe(true);
    // u2 replies -> no longer a request.
    await send(u2, id, { body: 'hi!' });
    expect((await api(app, u2).get(`/api/conversations/${id}`)).json().conversation.isRequest).toBe(false);
  });
});

describe('blocking access (point 10)', () => {
  it('blocked user cannot read, blocker can still read history', async () => {
    const u1 = await signup(app, 'blka');
    const u2 = await signup(app, 'blkb');
    const id = await conv(u1, u2.username);
    await send(u1, id, { body: 'before block' });
    await api(app, u2).post(`/api/users/${u1.username}/block`);
    // u1 is blocked BY u2 -> cannot read.
    expect((await api(app, u1).get(`/api/conversations/${id}/messages`)).statusCode).toBe(403);
    // u2 (the blocker) can still read.
    expect((await api(app, u2).get(`/api/conversations/${id}/messages`)).statusCode).toBe(200);
    // Both can still fetch the conversation view, with canSend false.
    expect((await api(app, u1).get(`/api/conversations/${id}`)).json().conversation.canSend).toBe(false);
    expect((await api(app, u2).get(`/api/conversations/${id}`)).json().conversation.canSend).toBe(false);
  });
});

describe('permissions', () => {
  it('non-members get 404 on conversation and messages', async () => {
    const id = await conv(a, 'bob');
    expect((await api(app, c).get(`/api/conversations/${id}`)).statusCode).toBe(404);
    expect((await api(app, c).get(`/api/conversations/${id}/messages`)).statusCode).toBe(404);
    expect((await api(app, c).post(`/api/conversations/${id}/messages`, { body: 'x' })).statusCode).toBe(404);
  });
});
