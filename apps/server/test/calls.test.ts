import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io as ioClient, type Socket } from 'socket.io-client';
import { api, makeApp, signup, type TestUser } from './helpers.js';
import { timing } from '../src/services/calls.js';
import { config } from '../src/config.js';

let app: FastifyInstance;
let base: string;
let alice: TestUser, bob: TestUser, cara: TestUser, dina: TestUser, eve: TestUser;
let convAB: string, convAC: string, convBC: string, convAD: string, convAE: string;
const sockets: Socket[] = [];
let n = 0;

// Short waits so the ring timeout and "person vanished" cases run in a blink.
timing.ringMs = 600;
timing.callerGoneRingingMs = 400;
timing.goneActiveMs = 500;
timing.connectDeadlineMs = 60_000;
timing.sweepMs = 50;
timing.maxInvitesPerMinute = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ack = Record<string, any>;
function connect(u: TestUser, device = `dev${++n}abcdefgh`): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(base, { extraHeaders: { cookie: u.cookie }, transports: ['websocket'], auth: { deviceId: device }, reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const emit = (s: Socket, event: string, payload: unknown): Promise<Ack> => new Promise((resolve) => s.emit(event, payload, (r: Ack) => resolve(r)));
/** Resolves with the next event matching `pred`, or null after `ms`. Starts listening right away. */
function next<T = any>(s: Socket, event: string, pred: (p: T) => boolean = () => true, ms = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      s.off(event, h);
      resolve(null);
    }, ms);
    const h = (p: T) => {
      if (!pred(p)) return;
      clearTimeout(t);
      s.off(event, h);
      resolve(p);
    };
    s.on(event, h);
  });
}
const never = async <T,>(p: Promise<T | null>) => (await p) === null;

async function follow(a: TestUser, b: TestUser) {
  await api(app, a).post(`/api/users/${b.username}/follow`);
}
async function conv(a: TestUser, b: TestUser): Promise<string> {
  return (await api(app, a).post('/api/conversations', { username: b.username })).json().conversation.id;
}
async function callLines(u: TestUser, convId: string) {
  const r = (await api(app, u).get(`/api/conversations/${convId}/messages`)).json();
  return (r.items as any[]).filter((m) => m.kind === 'call');
}
async function unread(u: TestUser, convId: string): Promise<number> {
  const r = (await api(app, u).get('/api/conversations')).json();
  return (r.items as any[]).find((c) => c.id === convId)?.unread ?? -1;
}
async function read(u: TestUser, convId: string) {
  await api(app, u).post(`/api/conversations/${convId}/read`, {});
}
/** Let any call both of these people are in finish before the next test starts. */
async function settle() {
  await sleep(timing.sweepMs * 4);
}

beforeAll(async () => {
  app = await makeApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  alice = await signup(app, 'calla');
  bob = await signup(app, 'callb');
  cara = await signup(app, 'callc');
  dina = await signup(app, 'calld', { dmPolicy: 'everyone' });
  eve = await signup(app, 'calle');
  // alice <-> bob follow each other; alice <-> cara follow each other; bob follows cara. Dina and Eve are strangers.
  await follow(alice, bob);
  await follow(bob, alice);
  await follow(alice, cara);
  await follow(cara, alice);
  await follow(bob, cara);
  await follow(cara, bob);
  convAB = await conv(alice, bob);
  convAC = await conv(alice, cara);
  convBC = await conv(bob, cara);
  convAD = await conv(alice, dina); // dina does not follow alice and has never replied
  convAE = await conv(eve, alice);
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await app.close();
});

describe('a normal call', () => {
  it('rings, is answered, passes signals both ways, and is written into the chat', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const b2 = await connect(bob); // bob's second tab
    const incoming = next(b, 'call:incoming');
    const incoming2 = next(b2, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'video' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.call.role).toBe('caller');
    expect(r.call.peer.username).toBe('callb');
    const inc = await incoming;
    expect(inc?.callId).toBe(r.callId);
    expect(inc?.kind).toBe('video');
    expect(inc?.role).toBe('callee');
    expect(inc?.peer.username).toBe('calla');
    expect(await incoming2).not.toBeNull(); // every tab rings

    // The caller cannot send media details until it is answered.
    const early = await emit(a, 'call:signal', { callId: r.callId, data: { type: 'description', description: { type: 'offer', sdp: 'v=0' } } });
    expect(early.ok).toBe(false);

    const accepted = next(a, 'call:accepted');
    const elsewhere = next(b2, 'call:ended', (p: any) => p.callId === r.callId);
    const acc = await emit(b, 'call:accept', { callId: r.callId });
    expect(acc.ok).toBe(true);
    expect((await accepted)?.callId).toBe(r.callId);
    expect((await elsewhere)?.reason).toBe('answered_elsewhere');

    // offer -> answer -> candidates
    const gotOffer = next(b, 'call:signal');
    await emit(a, 'call:signal', { callId: r.callId, data: { type: 'description', description: { type: 'offer', sdp: 'v=0 offer' } } });
    expect((await gotOffer)?.data.description.sdp).toBe('v=0 offer');
    const gotAnswer = next(a, 'call:signal');
    await emit(b, 'call:signal', { callId: r.callId, data: { type: 'description', description: { type: 'answer', sdp: 'v=0 answer' } } });
    expect((await gotAnswer)?.data.description.type).toBe('answer');
    const gotCand = next(b, 'call:signal');
    await emit(a, 'call:signal', { callId: r.callId, data: { type: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } } });
    expect((await gotCand)?.data.type).toBe('candidate');
    // end-of-candidates is null
    const gotEnd = next(a, 'call:signal');
    await emit(b, 'call:signal', { callId: r.callId, data: { type: 'candidate', candidate: null } });
    expect((await gotEnd)?.data.candidate).toBeNull();

    // the second tab does not see this call's signals
    expect(await never(next(b2, 'call:signal', () => true, 200))).toBe(true);

    const activeA = next(a, 'call:active');
    const activeB = next(b, 'call:active');
    expect((await emit(a, 'call:connected', { callId: r.callId })).ok).toBe(true);
    expect(await activeA).not.toBeNull();
    expect(await activeB).not.toBeNull();

    // peer state is relayed
    const peerState = next(b, 'call:peer');
    await emit(a, 'call:peer', { callId: r.callId, state: { muted: true, video: false, quality: 'poor' } });
    expect((await peerState)?.state).toEqual({ muted: true, video: false, quality: 'poor' });

    await sleep(120);
    const endedB = next(b, 'call:ended');
    const endedA = next(a, 'call:ended');
    const msgB = next(b, 'message:new', (p: any) => p.message.kind === 'call');
    expect((await emit(a, 'call:end', { callId: r.callId })).ok).toBe(true);
    const eb = await endedB;
    expect(eb?.status).toBe('completed');
    expect((await endedA)?.status).toBe('completed');
    const line = (await msgB)?.message;
    expect(line.call.status).toBe('completed');
    expect(line.call.kind).toBe('video');
    expect(line.call.durationMs).toBeGreaterThanOrEqual(100);
    expect(line.senderId).toBe(alice.id);

    const mine = await callLines(alice, convAB);
    const theirs = await callLines(bob, convAB);
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(theirs[0].call.status).toBe('completed');
    // a finished call does not light up the inbox
    expect(await unread(bob, convAB)).toBe(0);
    // the chat list previews it
    const list = (await api(app, bob).get('/api/conversations')).json().items.find((c: any) => c.id === convAB);
    expect(list.lastMessage.kind).toBe('call');
    await settle();
  });

  it('a declined call is logged for both and is not unread', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    const endedA = next(a, 'call:ended');
    expect((await emit(b, 'call:end', { callId: r.callId, reason: 'decline' })).ok).toBe(true);
    expect((await endedA)?.status).toBe('declined');
    await sleep(80);
    const lines = await callLines(bob, convAB);
    expect(lines.at(-1).call.status).toBe('declined');
    expect(await unread(bob, convAB)).toBe(0);
    await settle();
  });

  it('a call cancelled by the caller shows as missed (unread) to the person called', async () => {
    await read(bob, convAB);
    const a = await connect(alice);
    const b = await connect(bob);
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    const endedB = next(b, 'call:ended');
    await emit(a, 'call:end', { callId: r.callId, reason: 'cancel' });
    expect((await endedB)?.status).toBe('cancelled');
    await sleep(80);
    expect((await callLines(bob, convAB)).at(-1).call.status).toBe('cancelled');
    expect(await unread(bob, convAB)).toBe(1);
    expect(await unread(alice, convAB)).toBe(0); // the caller has seen their own call
    await read(bob, convAB);
    expect(await unread(bob, convAB)).toBe(0);
    await settle();
  });

  it('an unanswered call times out as missed', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    const ended = await next(b, 'call:ended', (p: any) => p.callId === r.callId, 2500);
    expect(ended?.status).toBe('missed');
    expect(ended?.reason).toBe('timeout');
    await sleep(80);
    expect((await callLines(alice, convAB)).at(-1).call.status).toBe('missed');
    // a late answer is refused cleanly
    expect((await emit(b, 'call:accept', { callId: r.callId })).ok).toBe(false);
    await settle();
  });
});

describe('who can call', () => {
  it('is told when the other person is offline, and the call is logged as missed', async () => {
    const a = await connect(alice);
    const r = await emit(a, 'call:invite', { conversationId: convAC, kind: 'audio' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('offline');
    await sleep(80);
    expect((await callLines(cara, convAC)).at(-1).call.status).toBe('missed');
    expect(await unread(cara, convAC)).toBe(1);
  });

  it('rings silently, without revealing they are offline, when they hide their online status', async () => {
    await api(app, cara).patch('/api/me', { showOnline: false });
    const a = await connect(alice);
    const r = await emit(a, 'call:invite', { conversationId: convAC, kind: 'audio' });
    expect(r.ok).toBe(true);
    const ended = await next(a, 'call:ended', (p: any) => p.callId === r.callId, 2500);
    expect(ended?.status).toBe('missed');
    await api(app, cara).patch('/api/me', { showOnline: true });
    await settle();
  });

  it('tells a second caller the person is busy, and logs it', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const c = await connect(cara);
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    await emit(b, 'call:accept', { callId: r.callId });
    // bob is now in a call; cara calls bob
    const busy = await emit(c, 'call:invite', { conversationId: convBC, kind: 'audio' });
    expect(busy.ok).toBe(false);
    expect(busy.code).toBe('busy');
    await sleep(80);
    expect((await callLines(bob, convBC)).at(-1).call.status).toBe('busy');
    // and alice cannot start another call while in this one
    const again = await emit(a, 'call:invite', { conversationId: convAC, kind: 'audio' });
    expect(again.code).toBe('in_call');
    await emit(a, 'call:end', { callId: r.callId });
    await settle();
  });

  it('refuses people who have not been accepted, groups, strangers and the wrong chat', async () => {
    const a = await connect(alice);
    const d = await connect(dina);
    const e = await connect(eve);
    // alice wrote to dina; dina neither follows alice nor has replied
    const notAccepted = await emit(a, 'call:invite', { conversationId: convAD, kind: 'audio' });
    expect(notAccepted.ok).toBe(false);
    expect(notAccepted.code).toBe('forbidden');
    expect(notAccepted.message).toContain('accepted');
    // eve is not in alice/bob's chat
    expect((await emit(e, 'call:invite', { conversationId: convAB, kind: 'audio' })).code).toBe('not_found');
    expect((await emit(e, 'call:invite', { conversationId: 'doesnotexist', kind: 'audio' })).code).toBe('not_found');
    // groups are not supported
    const group = (await api(app, alice).post('/api/conversations/group', { title: 'trio', memberIds: [bob.id, cara.id] })).json().conversation.id;
    expect((await emit(a, 'call:invite', { conversationId: group, kind: 'audio' })).code).toBe('forbidden');
    // the stranger can call once they have replied
    await api(app, dina).post(`/api/conversations/${convAD}/messages`, { body: 'hi' });
    const ok = await emit(a, 'call:invite', { conversationId: convAD, kind: 'audio' });
    expect(ok.ok).toBe(true);
    await emit(a, 'call:end', { callId: ok.callId, reason: 'cancel' });
    void d;
    await settle();
  });

  it('refuses when blocked, or when the person accepts no messages', async () => {
    const a = await connect(alice);
    await connect(eve);
    await api(app, eve).patch('/api/me', { dmPolicy: 'nobody' });
    expect((await emit(a, 'call:invite', { conversationId: convAE, kind: 'audio' })).ok).toBe(false);
    await api(app, eve).patch('/api/me', { dmPolicy: 'everyone' });
    await api(app, eve).post(`/api/users/${alice.username}/block`);
    const blocked = await emit(a, 'call:invite', { conversationId: convAE, kind: 'audio' });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('forbidden');
    await api(app, eve).del(`/api/users/${alice.username}/block`);
    await settle();
  });

  it('limits how fast one person can ring', async () => {
    const x = await signup(app, 'callspam');
    const y = await signup(app, 'callspamy');
    await follow(y, x);
    const cid = await conv(x, y);
    const sx = await connect(x);
    timing.maxInvitesPerMinute = 5;
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) codes.push((await emit(sx, 'call:invite', { conversationId: cid, kind: 'audio' })).code ?? 'ok');
    timing.maxInvitesPerMinute = 1000;
    expect(codes.filter((c) => c === 'rate_limited').length).toBeGreaterThanOrEqual(4);
    expect(codes.slice(0, 1)).not.toContain('rate_limited');
  });

  it('two people calling each other at once end up in one call', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const inc = next(b, 'call:incoming');
    const first = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await inc;
    const accepted = next(a, 'call:accepted');
    const second = await emit(b, 'call:invite', { conversationId: convAB, kind: 'audio' });
    expect(second.ok).toBe(true);
    expect(second.glare).toBe(true);
    expect(second.callId).toBe(first.callId);
    expect(second.call.role).toBe('callee');
    expect(await accepted).not.toBeNull();
    await emit(a, 'call:end', { callId: first.callId });
    await settle();
  });
});

describe('signalling safety', () => {
  it('only the two devices on a call can send signals, and bad data is refused', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const e = await connect(eve);
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    await emit(b, 'call:accept', { callId: r.callId });
    const offer = { type: 'description', description: { type: 'offer', sdp: 'v=0' } };
    expect((await emit(e, 'call:signal', { callId: r.callId, data: offer })).ok).toBe(false);
    expect((await emit(e, 'call:end', { callId: r.callId })).ok).toBe(false);
    // a second tab of alice is not the call's device
    const a2 = await connect(alice);
    expect((await emit(a2, 'call:signal', { callId: r.callId, data: offer })).ok).toBe(false);
    expect((await emit(a2, 'call:end', { callId: r.callId })).ok).toBe(false);
    // junk and oversized payloads
    expect((await emit(a, 'call:signal', { callId: r.callId, data: { type: 'description', description: { type: 'offer', sdp: 'x'.repeat(70_000) } } })).ok).toBe(false);
    expect((await emit(a, 'call:signal', { callId: r.callId, data: { type: 'nope' } })).ok).toBe(false);
    expect((await emit(a, 'call:signal', 'not an object')).ok).toBe(false);
    // the call is still fine
    expect((await emit(a, 'call:signal', { callId: r.callId, data: offer })).ok).toBe(true);
    // only the callee can accept
    expect((await emit(a, 'call:accept', { callId: r.callId })).ok).toBe(false);
    await emit(a, 'call:end', { callId: r.callId });
    await settle();
  });

  it('refuses calls from a client that does not identify its tab', async () => {
    const s = await new Promise<Socket>((resolve, reject) => {
      const c = ioClient(base, { extraHeaders: { cookie: alice.cookie }, transports: ['websocket'], reconnection: false });
      sockets.push(c);
      c.on('connect', () => resolve(c));
      c.on('connect_error', reject);
    });
    const r = await emit(s, 'call:invite', { conversationId: convAB, kind: 'audio' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('unsupported');
  });
});

describe('weak connections', () => {
  it('keeps the call alive when a socket drops and reconnects with the same tab id', async () => {
    const a = await connect(alice, 'tab-alice-1234');
    const b = await connect(bob, 'tab-bob-12345');
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    await emit(b, 'call:accept', { callId: r.callId });
    await emit(a, 'call:connected', { callId: r.callId });

    a.close(); // network blip for alice
    await sleep(150); // shorter than goneActiveMs
    const a2 = await connect(alice, 'tab-alice-1234');
    const sync = await emit(a2, 'call:sync', {});
    expect(sync.call?.callId).toBe(r.callId);
    expect(sync.call.state).toBe('active');
    expect(sync.elsewhere).toBe(false);
    // signalling still works to and from the new socket
    const got = next(b, 'call:signal');
    expect((await emit(a2, 'call:signal', { callId: r.callId, data: { type: 'description', description: { type: 'offer', sdp: 'v=0' } } })).ok).toBe(true);
    expect(await got).not.toBeNull();
    const back = next(a2, 'call:signal');
    await emit(b, 'call:signal', { callId: r.callId, data: { type: 'description', description: { type: 'answer', sdp: 'v=0' } } });
    expect(await back).not.toBeNull();
    await emit(b, 'call:end', { callId: r.callId });
    await settle();
  });

  it('ends the call when someone is gone for good, and logs it', async () => {
    const a = await connect(alice, 'tab-alice-9999');
    const b = await connect(bob, 'tab-bob-99999');
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    await emit(b, 'call:accept', { callId: r.callId });
    await emit(b, 'call:connected', { callId: r.callId });
    const ended = next(a, 'call:ended', (p: any) => p.callId === r.callId, 3000);
    b.close();
    const e = await ended;
    expect(e?.reason).toBe('dropped');
    expect(e?.status).toBe('completed');
    await sleep(80);
    expect((await callLines(alice, convAB)).at(-1).call.status).toBe('completed');
    await settle();
  });

  it('cancels a ringing call if the caller closes the page', async () => {
    const a = await connect(alice, 'tab-alice-7777');
    const b = await connect(bob, 'tab-bob-77777');
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    const ended = next(b, 'call:ended', (p: any) => p.callId === r.callId, 3000);
    a.close();
    const e = await ended;
    expect(e?.status).toBe('cancelled');
    await settle();
  });

  it('a reloaded page learns its old call is over, and a ringing call is offered again', async () => {
    const a = await connect(alice, 'tab-alice-5555');
    const b = await connect(bob, 'tab-bob-55555');
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    // bob reloads while it rings: the new tab is told about the call
    b.close();
    const bReload = await connect(bob, 'tab-bob-newtab1');
    const sync = await emit(bReload, 'call:sync', {});
    expect(sync.call?.callId).toBe(r.callId);
    expect(sync.call.role).toBe('callee');
    expect(sync.call.state).toBe('ringing');
    expect((await emit(bReload, 'call:accept', { callId: r.callId })).ok).toBe(true);
    await emit(bReload, 'call:connected', { callId: r.callId });
    // now bob reloads again mid-call: the old page is gone, so the call ends instead of hanging
    bReload.close();
    await sleep(40);
    const fresh = await connect(bob, 'tab-bob-newtab2');
    const after = await emit(fresh, 'call:sync', {});
    expect(after.call).toBeNull();
    await settle();
  });

  it('reports no call when there is none', async () => {
    const b = await connect(bob);
    expect((await emit(b, 'call:sync', {})).call).toBeNull();
  });

  it('blocking someone ends the call between you', async () => {
    const a = await connect(alice);
    const b = await connect(bob);
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    await emit(b, 'call:accept', { callId: r.callId });
    const ended = next(a, 'call:ended');
    await api(app, bob).post(`/api/users/${alice.username}/block`);
    expect((await ended)?.reason).toBe('blocked');
    await api(app, bob).del(`/api/users/${alice.username}/block`);
    await follow(alice, bob);
    await follow(bob, alice);
    await settle();
  });
});

describe('call lines in the chat', () => {
  it('cannot be edited, unsent, reacted to, starred, forwarded or replied to, but can be deleted for me', async () => {
    const lines = await callLines(alice, convAB);
    expect(lines.length).toBeGreaterThan(0);
    const id = lines[0].id;
    expect((await api(app, alice).patch(`/api/messages/${id}`, { body: 'hello' })).statusCode).toBe(400);
    expect((await api(app, alice).del(`/api/messages/${id}`)).statusCode).toBe(400);
    expect((await api(app, alice).put(`/api/messages/${id}/reaction`, { emoji: '👍' })).statusCode).toBe(400);
    expect((await api(app, bob).put(`/api/messages/${id}/reaction`, { emoji: '👍' })).statusCode).toBe(400);
    expect((await api(app, alice).put(`/api/messages/${id}/star`, { starred: true })).statusCode).toBe(400);
    expect((await api(app, alice).post(`/api/messages/${id}/forward`, { conversationIds: [convAC] })).statusCode).toBe(400);
    expect((await api(app, alice).post(`/api/conversations/${convAB}/messages`, { body: 'x', replyToId: id })).statusCode).toBe(400);
    expect((await api(app, alice).post(`/api/messages/${id}/hide`, {})).statusCode).toBe(200);
    expect((await callLines(alice, convAB)).find((m) => m.id === id)).toBeUndefined();
    expect((await callLines(bob, convAB)).find((m) => m.id === id)).toBeDefined(); // only hidden for alice
  });

  it('follows the chat’s disappearing-message timer', async () => {
    await api(app, alice).patch(`/api/conversations/${convAB}`, { ttlSeconds: 86_400 });
    const a = await connect(alice);
    const b = await connect(bob);
    const ring = next(b, 'call:incoming');
    const r = await emit(a, 'call:invite', { conversationId: convAB, kind: 'audio' });
    await ring;
    await emit(a, 'call:end', { callId: r.callId, reason: 'cancel' });
    await sleep(80);
    const line = (await callLines(alice, convAB)).at(-1);
    expect(line.expiresAt).toBeGreaterThan(Date.now() + 80_000_000);
    await api(app, alice).patch(`/api/conversations/${convAB}`, { ttlSeconds: 0 });
    await settle();
  });
});

describe('connection servers (ICE)', () => {
  it('uses the Jami relay unless JAMI_RELAY says off', async () => {
    const { JAMI_RELAY } = await import('../src/routes/calls.js');
    expect(config.jamiRelay).toBe(process.env.JAMI_RELAY ? !/^(off|false|0|no)$/i.test(process.env.JAMI_RELAY) : true);
    config.jamiRelay = true;
    const on = (await api(app, alice).get('/api/calls/ice')).json();
    expect(on.relay).toBe(true);
    const jami = on.iceServers.find((s: any) => s.username === 'ring');
    expect(jami).toEqual(JAMI_RELAY);
    expect(jami.urls).toEqual(['turn:turn.jami.net:3478?transport=udp', 'turn:turn.jami.net:3478?transport=tcp']);
    // STUN comes first, so direct routes are always found too.
    expect(JSON.stringify(on.iceServers[0])).toContain('stun:');
    config.jamiRelay = false;
    const off = (await api(app, alice).get('/api/calls/ice')).json();
    expect(off.relay).toBe(false);
    expect(JSON.stringify(off.iceServers)).not.toContain('jami');
  });

  it('needs a signed-in user and always includes free STUN', async () => {
    expect((await api(app).get('/api/calls/ice')).statusCode).toBe(401);
    const res = await api(app, alice).get('/api/calls/ice');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(JSON.stringify(body.iceServers)).toContain('stun:');
    expect(body.relay).toBe(false);
  });

  it('adds a relay from static settings', async () => {
    Object.assign(config, { turnUrls: ['turn:relay.example.test:3478'], turnUsername: 'u', turnCredential: 'p' });
    const body = (await api(app, alice).get('/api/calls/ice')).json();
    expect(body.relay).toBe(true);
    expect(body.iceServers.some((s: any) => s.username === 'u' && s.credential === 'p')).toBe(true);
    Object.assign(config, { turnUrls: [], turnUsername: undefined, turnCredential: undefined });
  });

  it('offers your own relay first and Jami after it, without listing the same relay twice', async () => {
    config.jamiRelay = true;
    Object.assign(config, {
      turnUrls: ['turn:relay.example.test:3478', 'turn:turn.jami.net:3478?transport=udp'],
      turnUsername: 'ring',
      turnCredential: 'ring',
    });
    const body = (await api(app, alice).get('/api/calls/ice')).json();
    const relays = body.iceServers.filter((s: any) => s.username);
    expect(relays.map((s: any) => s.urls)).toEqual([
      ['turn:relay.example.test:3478', 'turn:turn.jami.net:3478?transport=udp'],
      ['turn:turn.jami.net:3478?transport=tcp'],
    ]);
    Object.assign(config, { turnUrls: [], turnUsername: undefined, turnCredential: undefined, jamiRelay: false });
  });

  it('fetches a relay list from a credentials service, reuses it, and survives it failing', async () => {
    let hits = 0;
    let mode: 'ok' | 'down' = 'ok';
    const srv = http.createServer((_req, res) => {
      hits++;
      if (mode === 'down') {
        res.statusCode = 500;
        return res.end('nope');
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([{ urls: 'stun:ignored.example.test' }, { urls: ['turn:a.example.test:80', 'turns:a.example.test:443'], username: 'x', credential: 'y' }]));
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as { port: number }).port;
    Object.assign(config, { turnApiUrl: `http://127.0.0.1:${port}/creds` });
    const one = (await api(app, alice).get('/api/calls/ice')).json();
    const two = (await api(app, bob).get('/api/calls/ice')).json();
    expect(one.relay).toBe(true);
    expect(JSON.stringify(one.iceServers)).toContain('turns:a.example.test:443');
    expect(JSON.stringify(one.iceServers)).not.toContain('ignored.example.test');
    expect(two.relay).toBe(true);
    expect(hits).toBe(1); // second request served from the cache
    mode = 'down';
    Object.assign(config, { turnApiUrl: `http://127.0.0.1:${port}/other` }); // new URL, cache still holds the last good list
    const down = await api(app, alice).get('/api/calls/ice');
    expect(down.statusCode).toBe(200);
    expect(JSON.stringify(down.json().iceServers)).toContain('stun:');
    Object.assign(config, { turnApiUrl: undefined });
    await new Promise((r) => srv.close(r));
  });
});
