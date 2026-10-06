import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as ioClient, type Socket } from 'socket.io-client';
import sharp from 'sharp';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let base: string;
let mia: TestUser, noah: TestUser, olga: TestUser;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  mia = await signup(app, 'mia');
  noah = await signup(app, 'noah');
  olga = await signup(app, 'olga', { dmPolicy: 'following' });
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await app.close();
});

function connect(u: TestUser): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(base, { extraHeaders: { cookie: u.cookie }, transports: ['websocket'] });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const next = <T>(s: Socket, event: string) => new Promise<T>((resolve) => s.once(event, resolve));

describe('direct messages', () => {
  it('rejects unauthenticated sockets', async () => {
    const s = ioClient(base, { transports: ['websocket'] });
    sockets.push(s);
    const err = await new Promise<Error>((resolve) => s.on('connect_error', resolve));
    expect(err.message).toBe('unauthorized');
  });

  it('delivers messages, typing, reads and reactions in realtime', async () => {
    const sm = await connect(mia);
    const sn = await connect(noah);

    const conv = (await api(app, mia).post('/api/conversations', { username: 'noah' })).json().conversation;
    expect(conv.other.username).toBe('noah');
    // Same pair -> same conversation
    expect((await api(app, noah).post('/api/conversations', { username: 'mia' })).json().conversation.id).toBe(conv.id);

    const typing = next<{ conversationId: string; userId: string }>(sn, 'typing');
    sm.emit('typing', { conversationId: conv.id });
    expect((await typing).userId).toBe(mia.id);

    const incoming = next<{ message: { body: string; id: string } }>(sn, 'message:new');
    const sent = await api(app, mia).post(`/api/conversations/${conv.id}/messages`, { body: 'hey noah' });
    expect(sent.statusCode).toBe(201);
    expect((await incoming).message.body).toBe('hey noah');

    // Noah doesn't follow Mia and hasn't replied -> it's a request for him.
    const reqs = (await api(app, noah).get('/api/conversations?tab=requests')).json().items;
    expect(reqs.map((c: { id: string }) => c.id)).toEqual([conv.id]);
    expect((await api(app, noah).get('/api/me/counts')).json().messageRequests).toBe(1);

    const read = next<{ userId: string }>(sm, 'conversation:read');
    await api(app, noah).post(`/api/conversations/${conv.id}/read`);
    expect((await read).userId).toBe(noah.id);

    const msgId = sent.json().message.id;
    const updated = next<{ message: { reactions: { emoji: string }[] } }>(sm, 'message:updated');
    await api(app, noah).put(`/api/messages/${msgId}/reaction`, { emoji: '❤️' });
    expect((await updated).message.reactions[0]!.emoji).toBe('❤️');

    // Replying moves it into Noah's primary inbox
    await api(app, noah).post(`/api/conversations/${conv.id}/messages`, { body: 'hi!', replyToId: msgId });
    const primary = (await api(app, noah).get('/api/conversations')).json().items;
    expect(primary[0].id).toBe(conv.id);
    expect(primary[0].lastMessage.replyTo.body).toBe('hey noah');

    // Unsend
    expect((await api(app, noah).del(`/api/messages/${msgId}`)).statusCode).toBe(403);
    const un = (await api(app, mia).del(`/api/messages/${msgId}`)).json().message;
    expect(un.deleted).toBe(true);
    expect(un.body).toBe('');

    const history = (await api(app, mia).get(`/api/conversations/${conv.id}/messages`)).json();
    expect(history.items).toHaveLength(2);
  });

  it('enforces DM policy and blocks', async () => {
    const r = await api(app, mia).post('/api/conversations', { username: 'olga' });
    expect(r.statusCode).toBe(403);
    await api(app, olga).post('/api/users/mia/follow');
    expect((await api(app, mia).post('/api/conversations', { username: 'olga' })).statusCode).toBe(200);

    const conv = (await api(app, mia).post('/api/conversations', { username: 'noah' })).json().conversation;
    await api(app, noah).post('/api/users/mia/block');
    expect((await api(app, mia).post(`/api/conversations/${conv.id}/messages`, { body: 'still there?' })).statusCode).toBe(403);
    // Outsiders cannot read the conversation
    expect((await api(app, olga).get(`/api/conversations/${conv.id}/messages`)).statusCode).toBe(404);
  });

  it('tracks presence for watchers', async () => {
    const watcher = await connect(olga);
    const snap = next<{ userId: string; online: boolean }[]>(watcher, 'presence:snapshot');
    watcher.emit('presence:watch', [mia.id]);
    const s = await snap;
    expect(s[0]!.online).toBe(true); // mia's socket from the earlier test is still connected
  });
});

describe('uploads', () => {
  it('converts images to webp and allows attaching only own uploads', async () => {
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#336699' } }).png().toBuffer();
    const boundary = '----wetext';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: 'POST',
      url: '/api/uploads?kind=media',
      headers: { cookie: mia.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(up.statusCode, up.body).toBe(201);
    const { url, width, height } = up.json();
    expect(url).toMatch(/\.webp$/);
    expect([width, height]).toEqual([64, 32]);

    const file = await app.inject({ method: 'GET', url });
    expect(file.statusCode).toBe(200);

    const ok = await api(app, mia).post('/api/posts', { content: 'pic', media: [{ url, width, height }] });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().post.media[0].url).toBe(url);
    const stolen = await api(app, noah).post('/api/posts', { content: 'pic', media: [{ url, width, height }] });
    expect(stolen.statusCode).toBe(403);
  });
});
