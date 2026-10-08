import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as ioClient, type Socket } from 'socket.io-client';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let base: string;
let alice: TestUser, bob: TestUser, cara: TestUser, dave: TestUser;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  alice = await signup(app, 'ralice');
  bob = await signup(app, 'rbob');
  cara = await signup(app, 'rcara');
  dave = await signup(app, 'rdave');
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
/** Wait for an event whose payload matches `pred` (ignores earlier/buffered events that don't). */
function waitFor<T>(s: Socket, event: string, pred: (p: T) => boolean, ms = 1000): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      s.off(event, handler);
      resolve(null);
    }, ms);
    const handler = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(t);
      s.off(event, handler);
      resolve(p);
    };
    s.on(event, handler);
  });
}
/** Resolve to true if an event matching `pred` fires within `ms`, else false. */
function firesMatching<T>(s: Socket, event: string, pred: (p: T) => boolean, ms = 400): Promise<boolean> {
  return waitFor<T>(s, event, pred, ms).then((p) => p !== null);
}

async function makeGroup(creator: TestUser, title: string, memberIds: string[]) {
  return (await api(app, creator).post('/api/conversations/group', { title, memberIds })).json().conversation;
}

describe('group realtime', () => {
  it('delivers message:new to all active members', async () => {
    const sa = await connect(alice);
    const sb = await connect(bob);
    const sc = await connect(cara);
    const conv = await makeGroup(alice, 'RT1', [bob.id, cara.id]);

    const toB = waitFor<{ message: { body: string } }>(sb, 'message:new', (p) => p.message.body === 'hello group');
    const toC = waitFor<{ message: { body: string } }>(sc, 'message:new', (p) => p.message.body === 'hello group');
    await api(app, alice).post(`/api/conversations/${conv.id}/messages`, { body: 'hello group' });
    expect((await toB)?.message.body).toBe('hello group');
    expect((await toC)?.message.body).toBe('hello group');
    void sa;
  });

  it('relays typing to all other active members with userId, not to a removed member', async () => {
    const sb = await connect(bob);
    const sc = await connect(cara);
    const sd = await connect(dave);
    const conv = await makeGroup(alice, 'RT2', [bob.id, cara.id, dave.id]);

    // Remove dave; he must not receive typing afterwards.
    await api(app, alice).del(`/api/conversations/${conv.id}/members/${dave.id}`);

    const sa = await connect(alice);
    const typB = waitFor<{ userId: string }>(sb, 'typing', (p) => p.userId === alice.id);
    const typC = waitFor<{ userId: string }>(sc, 'typing', (p) => p.userId === alice.id);
    const typD = firesMatching<{ userId: string }>(sd, 'typing', (p) => p.userId === alice.id, 400);
    sa.emit('typing', { conversationId: conv.id });
    expect((await typB)?.userId).toBe(alice.id);
    expect((await typC)?.userId).toBe(alice.id);
    expect(await typD).toBe(false);
  });

  it('relays recording to active members with userId included', async () => {
    const sb = await connect(bob);
    const conv = await makeGroup(alice, 'RT3', [bob.id, cara.id]);
    const rec = waitFor<{ conversationId: string; userId: string; on: boolean }>(sb, 'recording', (p) => p.conversationId === conv.id);
    const sa = await connect(alice);
    sa.emit('recording', { conversationId: conv.id, on: true });
    const r = await rec;
    expect(r?.userId).toBe(alice.id);
    expect(r?.on).toBe(true);
  });

  it('emits conversation:members on membership and title changes', async () => {
    const sb = await connect(bob);
    const conv = await makeGroup(alice, 'RT4', [bob.id, cara.id]);
    const onAdd = waitFor<{ conversationId: string }>(sb, 'conversation:members', (p) => p.conversationId === conv.id);
    await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: [dave.id] });
    expect((await onAdd)?.conversationId).toBe(conv.id);

    const onTitle = waitFor<{ conversationId: string }>(sb, 'conversation:members', (p) => p.conversationId === conv.id);
    const onUpdated = waitFor<{ conversationId: string; title: string }>(sb, 'conversation:updated', (p) => p.title === 'Renamed RT4');
    await api(app, alice).patch(`/api/conversations/${conv.id}`, { title: 'Renamed RT4' });
    expect((await onTitle)?.conversationId).toBe(conv.id);
    expect((await onUpdated)?.title).toBe('Renamed RT4');
  });

  it('emits conversation:read to all active members', async () => {
    const sa = await connect(alice);
    const conv = await makeGroup(alice, 'RT5', [bob.id, cara.id]);
    await api(app, alice).post(`/api/conversations/${conv.id}/messages`, { body: 'read me' });
    const read = waitFor<{ userId: string }>(sa, 'conversation:read', (p) => p.userId === bob.id);
    await api(app, bob).post(`/api/conversations/${conv.id}/read`);
    expect((await read)?.userId).toBe(bob.id);
  });

  it('a removed member stops receiving message:new', async () => {
    const sc = await connect(cara);
    const conv = await makeGroup(alice, 'RT6', [bob.id, cara.id]);
    await api(app, alice).del(`/api/conversations/${conv.id}/members/${cara.id}`);
    const got = firesMatching<{ message: { body: string } }>(sc, 'message:new', (p) => p.message.body === 'after cara left', 400);
    await api(app, alice).post(`/api/conversations/${conv.id}/messages`, { body: 'after cara left' });
    expect(await got).toBe(false);
  });
});
