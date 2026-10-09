import { z } from 'zod';
import type { Socket } from 'socket.io';
import type { Ctx, UserRow } from '../types.js';
import { followStatus, canStartConversation } from './graph.js';
import { messageViews, type CallStatus, type MessageRow } from './chat.js';
import { newId } from '../lib/crypto.js';

/**
 * One-to-one audio and video calls.
 *
 * The server only introduces the two phones to each other (ringing, answering, passing connection details) and writes
 * the call into the chat afterwards. Sound and video travel directly between the phones (WebRTC), never through here.
 *
 * Live call state lives in memory: this app runs as a single process. A call is never stored while it is live; when it
 * ends, one `kind = 'call'` message is written to the conversation.
 *
 * A "device" is one open browser tab. Signals are addressed to a device room so they keep flowing if the socket drops
 * and reconnects in the middle of a call (which on a weak connection happens a lot).
 */

/** All the waiting periods in one place. Tests shorten them. */
export const timing = {
  /** An unanswered call gives up after this long. */
  ringMs: 45_000,
  /** A caller who vanishes while ringing cancels the call after this long. */
  callerGoneRingingMs: 12_000,
  /** A participant who vanishes during a call ends it after this long. Short drops are ridden out. */
  goneActiveMs: 30_000,
  /** Answered but the media never connected. */
  connectDeadlineMs: 45_000,
  /** How often the server looks for people who disappeared. */
  sweepMs: 2_000,
  /** How many calls one person may start per minute (a brake on ringing someone repeatedly). */
  maxInvitesPerMinute: 8,
};
const SIGNALS_PER_10S = 400;

export type CallKind = 'audio' | 'video';
export type EndReason = 'hangup' | 'decline' | 'cancel' | 'failed' | 'timeout' | 'dropped' | 'blocked' | 'answered_elsewhere' | 'busy';

interface Call {
  id: string;
  conversationId: string;
  kind: CallKind;
  callerId: string;
  calleeId: string;
  callerDevice: string;
  calleeDevice: string | null;
  callerInfo: PeerSummary;
  calleeInfo: PeerSummary;
  state: 'ringing' | 'active';
  /** The callee asked to hide their online status, so the call rings silently instead of reporting "offline". */
  silent: boolean;
  createdAt: number;
  answeredAt: number | null;
  connectedAt: number | null;
  ringTimer: NodeJS.Timeout | null;
  callerGoneSince: number | null;
  calleeGoneSince: number | null;
  signalWindowStart: number;
  signalCount: number;
  ended: boolean;
}

export interface PeerSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CallView {
  callId: string;
  conversationId: string;
  kind: CallKind;
  state: 'ringing' | 'active';
  role: 'caller' | 'callee';
  peer: PeerSummary;
  /** Milliseconds the call has been connected, or null if not connected yet. */
  elapsedMs: number | null;
  /** Milliseconds left before an unanswered call gives up. */
  ringLeftMs: number;
}

export type InviteResult =
  | { ok: true; callId: string; glare?: boolean; call: CallView }
  | { ok: false; code: 'in_call' | 'busy' | 'offline' | 'forbidden' | 'not_found' | 'rate_limited' | 'unsupported' | 'error'; message: string };

const description = z.object({
  type: z.literal('description'),
  description: z.object({ type: z.enum(['offer', 'answer', 'pranswer', 'rollback']), sdp: z.string().max(64_000).optional() }),
});
const candidate = z.object({
  type: z.literal('candidate'),
  candidate: z
    .object({
      candidate: z.string().max(2_000),
      sdpMid: z.string().max(64).nullish(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullish(),
      usernameFragment: z.string().max(64).nullish(),
    })
    .nullable(),
});
export const signalSchema = z.union([description, candidate]);

const peerStateSchema = z.object({
  muted: z.boolean().optional(),
  video: z.boolean().optional(),
  /** Whether the sender's own camera is being sent right now. */
  quality: z.enum(['good', 'fair', 'poor']).optional(),
  audioOnly: z.boolean().optional(),
  reconnecting: z.boolean().optional(),
  /** "Voice only to save data": asks the other side to stop sending video too. */
  saver: z.boolean().optional(),
});
export type PeerState = z.infer<typeof peerStateSchema>;


export class CallManager {
  private calls = new Map<string, Call>();
  /** userId -> the call they are in (ringing as the caller, or answered). */
  private byUser = new Map<string, string>();
  private invites = new Map<string, number[]>();
  private tick: NodeJS.Timeout;

  constructor(private ctx: Ctx) {
    this.tick = setInterval(() => this.sweep(), timing.sweepMs);
    this.tick.unref();
  }

  close() {
    clearInterval(this.tick);
    for (const c of this.calls.values()) if (c.ringTimer) clearTimeout(c.ringTimer);
    this.calls.clear();
    this.byUser.clear();
  }

  /* ------------------------------------------------------------------ socket wiring */

  bind(socket: Socket, userId: string, device: string | null) {
    const guard = <T>(schema: z.ZodType<T>, fn: (data: T, ack: (r: unknown) => void) => void | Promise<void>) =>
      (raw: unknown, ack?: unknown) => {
        const reply = typeof ack === 'function' ? (ack as (r: unknown) => void) : () => {};
        if (!device) return reply({ ok: false, code: 'unsupported', message: 'Update the app to use calls' });
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return reply({ ok: false, code: 'error', message: 'Invalid request' });
        void Promise.resolve(fn(parsed.data, reply)).catch(() => reply({ ok: false, code: 'error', message: 'Something went wrong' }));
      };
    const id = z.string().max(32);

    socket.on('call:invite', guard(z.object({ conversationId: id, kind: z.enum(['audio', 'video']) }), async (d, ack) => ack(await this.invite(userId, device!, d.conversationId, d.kind))));
    socket.on('call:accept', guard(z.object({ callId: id }), (d, ack) => ack(this.accept(userId, device!, d.callId))));
    socket.on('call:end', guard(z.object({ callId: id, reason: z.enum(['hangup', 'decline', 'cancel', 'failed']).optional() }), async (d, ack) => ack(await this.end(userId, device!, d.callId, d.reason ?? 'hangup'))));
    socket.on('call:signal', guard(z.object({ callId: id, data: signalSchema }), (d, ack) => ack(this.signal(userId, device!, d.callId, d.data))));
    socket.on('call:connected', guard(z.object({ callId: id }), (d, ack) => ack(this.connected(userId, device!, d.callId))));
    socket.on('call:peer', guard(z.object({ callId: id, state: peerStateSchema }), (d, ack) => ack(this.peer(userId, device!, d.callId, d.state))));
    socket.on('call:sync', guard(z.object({}).passthrough(), async (_d, ack) => ack(await this.sync(userId, device!))));
  }

  /* ------------------------------------------------------------------ operations */

  async invite(userId: string, device: string, conversationId: string, kind: CallKind): Promise<InviteResult> {
    const { db, rt } = this.ctx;
    const stamps = (this.invites.get(userId) ?? []).filter((t) => Date.now() - t < 60_000);
    if (stamps.length >= timing.maxInvitesPerMinute) return { ok: false, code: 'rate_limited', message: 'Too many calls in a row. Wait a moment.' };
    stamps.push(Date.now());
    this.invites.set(userId, stamps);

    if (this.byUser.has(userId)) return { ok: false, code: 'in_call', message: 'You are already in a call' };

    const conv = (await db.prepare('SELECT id, is_group, ttl_seconds FROM conversations WHERE id = ?').get(conversationId)) as { id: string; is_group: number; ttl_seconds: number | null } | undefined;
    const mine = conv ? await db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL').get(conversationId, userId) : null;
    if (!conv || !mine) return { ok: false, code: 'not_found', message: 'Chat not found' };
    if (conv.is_group) return { ok: false, code: 'forbidden', message: 'Calls work in one-to-one chats only' };
    const other = (await db.prepare('SELECT u.* FROM conversation_members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? AND m.user_id != ?').get(conversationId, userId)) as UserRow | undefined;
    const me = (await db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) as UserRow | undefined;
    if (!other || !me) return { ok: false, code: 'not_found', message: 'This account no longer exists' };

    const ok = await canStartConversation(db, me, other);
    if (!ok.ok) return { ok: false, code: 'forbidden', message: ok.reason ?? "You can't call this account" };
    // A call is more intrusive than a message: they must follow you, or have already written back in this chat.
    const follows = (await followStatus(db, other.id, me.id)) === 'active';
    const replied = !!(await db.prepare("SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ? AND kind = 'user' AND deleted_at IS NULL LIMIT 1").get(conversationId, other.id));
    if (!follows && !replied) return { ok: false, code: 'forbidden', message: `@${other.username} hasn't accepted your chat yet` };

    // Both people called each other at the same moment: join their call instead of making two.
    const crossing = [...this.calls.values()].find((c) => !c.ended && c.state === 'ringing' && c.callerId === other.id && c.calleeId === userId);
    if (crossing) {
      const joined = this.accept(userId, device, crossing.id);
      if (joined.ok) return { ok: true, callId: crossing.id, glare: true, call: joined.call };
    }

    const hidden = !other.show_online;
    if (this.byUser.has(other.id) || this.ringingFor(other.id)) {
      if (!hidden) {
        await this.log({ conversationId, callerId: userId, calleeId: other.id, kind, status: 'busy', ms: 0, ttl: conv.ttl_seconds ?? 0 });
        return { ok: false, code: 'busy', message: `@${other.username} is on another call` };
      }
    } else if (!rt.isOnline(other.id) && !hidden) {
      await this.log({ conversationId, callerId: userId, calleeId: other.id, kind, status: 'missed', ms: 0, ttl: conv.ttl_seconds ?? 0 });
      return { ok: false, code: 'offline', message: `@${other.username} is offline right now. They will see a missed call.` };
    }

    const call: Call = {
      id: newId(),
      conversationId,
      kind,
      callerId: userId,
      calleeId: other.id,
      callerDevice: device,
      calleeDevice: null,
      callerInfo: this.summary(me),
      calleeInfo: this.summary(other),
      state: 'ringing',
      silent: hidden && (!rt.isOnline(other.id) || this.byUser.has(other.id)),
      createdAt: Date.now(),
      answeredAt: null,
      connectedAt: null,
      ringTimer: null,
      callerGoneSince: null,
      calleeGoneSince: null,
      signalWindowStart: Date.now(),
      signalCount: 0,
      ended: false,
    };
    call.ringTimer = setTimeout(() => void this.finish(call, 'missed', 'timeout'), timing.ringMs);
    call.ringTimer.unref();
    this.calls.set(call.id, call);
    this.byUser.set(userId, call.id);

    if (!call.silent) rt.emitToUser(other.id, 'call:incoming', this.view(call, 'callee'));
    return { ok: true, callId: call.id, call: this.view(call, 'caller') };
  }

  accept(userId: string, device: string, callId: string): { ok: true; call: CallView } | { ok: false; code: string; message: string } {
    const call = this.calls.get(callId);
    if (!call || call.ended) return { ok: false, code: 'gone', message: 'This call has ended' };
    if (call.calleeId !== userId) return { ok: false, code: 'forbidden', message: 'Not your call' };
    if (call.state !== 'ringing') return { ok: false, code: 'gone', message: 'This call was already answered' };
    const mine = this.byUser.get(userId);
    if (mine && mine !== callId) return { ok: false, code: 'in_call', message: 'You are already in a call' };

    if (call.ringTimer) clearTimeout(call.ringTimer);
    call.ringTimer = null;
    call.state = 'active';
    call.calleeDevice = device;
    call.answeredAt = Date.now();
    call.silent = false;
    this.byUser.set(userId, callId);

    const { rt } = this.ctx;
    // Other tabs and phones of the callee stop ringing.
    rt.io?.to(`user:${userId}`).except(`device:${device}`).emit('call:ended', { callId, reason: 'answered_elsewhere', status: 'completed' });
    rt.emitToDevice(call.callerDevice, 'call:accepted', { callId });
    // Anyone else still ringing this person is told they are busy.
    for (const other of this.calls.values()) {
      if (other !== call && !other.ended && other.state === 'ringing' && other.calleeId === userId) void this.finish(other, 'busy', 'busy');
    }
    return { ok: true, call: this.view(call, 'callee') };
  }

  async end(userId: string, device: string, callId: string, reason: 'hangup' | 'decline' | 'cancel' | 'failed') {
    const call = this.calls.get(callId);
    if (!call || call.ended) return { ok: true, already: true };
    const isCaller = call.callerId === userId;
    const isCallee = call.calleeId === userId;
    if (!isCaller && !isCallee) return { ok: false, code: 'forbidden', message: 'Not your call' };
    if (call.state === 'active' && ((isCaller && call.callerDevice !== device) || (isCallee && call.calleeDevice !== device))) {
      return { ok: false, code: 'forbidden', message: 'This call is on another device' };
    }
    let status: CallStatus;
    if (call.state === 'ringing') status = isCallee ? 'declined' : 'cancelled';
    else if (call.connectedAt) status = 'completed';
    else if (reason === 'failed') status = 'failed';
    else status = isCallee ? 'declined' : 'cancelled';
    await this.finish(call, status, isCallee && call.state === 'ringing' ? 'decline' : reason, userId);
    return { ok: true };
  }

  signal(userId: string, device: string, callId: string, data: z.infer<typeof signalSchema>) {
    const call = this.calls.get(callId);
    if (!call || call.ended) return { ok: false, code: 'gone', message: 'This call has ended' };
    const now = Date.now();
    if (now - call.signalWindowStart > 10_000) {
      call.signalWindowStart = now;
      call.signalCount = 0;
    }
    if (++call.signalCount > SIGNALS_PER_10S) return { ok: false, code: 'rate_limited', message: 'Too many signals' };
    let to: string | null = null;
    if (call.callerId === userId && call.callerDevice === device) to = call.calleeDevice;
    else if (call.calleeId === userId && call.calleeDevice === device) to = call.callerDevice;
    else return { ok: false, code: 'forbidden', message: 'Not your device for this call' };
    // The caller sends its offer as soon as the callee picks up; until then there is no one to send it to.
    if (!to) return { ok: false, code: 'not_ready', message: 'Not answered yet' };
    this.ctx.rt.emitToDevice(to, 'call:signal', { callId, data });
    return { ok: true };
  }

  connected(userId: string, device: string, callId: string) {
    const call = this.calls.get(callId);
    if (!call || call.ended || call.state !== 'active') return { ok: false, code: 'gone', message: 'This call has ended' };
    if (!this.isParticipantDevice(call, userId, device)) return { ok: false, code: 'forbidden', message: 'Not your call' };
    if (!call.connectedAt) {
      call.connectedAt = Date.now();
      const payload = { callId, elapsedMs: 0 };
      this.ctx.rt.emitToDevice(call.callerDevice, 'call:active', payload);
      if (call.calleeDevice) this.ctx.rt.emitToDevice(call.calleeDevice, 'call:active', payload);
    }
    return { ok: true, elapsedMs: Date.now() - call.connectedAt };
  }

  peer(userId: string, device: string, callId: string, state: PeerState) {
    const call = this.calls.get(callId);
    if (!call || call.ended || call.state !== 'active') return { ok: false, code: 'gone', message: 'This call has ended' };
    if (!this.isParticipantDevice(call, userId, device)) return { ok: false, code: 'forbidden', message: 'Not your call' };
    const to = call.callerId === userId ? call.calleeDevice : call.callerDevice;
    if (to) this.ctx.rt.emitToDevice(to, 'call:peer', { callId, state });
    return { ok: true };
  }

  /** Where does this person's call stand? Used after a page load or a reconnect. */
  async sync(userId: string, device: string) {
    const id = this.byUser.get(userId) ?? this.ringingFor(userId)?.id;
    const call = id ? this.calls.get(id) : undefined;
    if (!call || call.ended) return { ok: true, call: null };
    const role = call.callerId === userId ? 'caller' : 'callee';
    const mine = role === 'caller' ? call.callerDevice : call.calleeDevice;
    const here = mine === device;
    if (!here && mine && !this.ctx.rt.deviceOnline(mine)) {
      // The page that held this call was closed or reloaded and did not come back: there is nothing left to resume.
      await this.finish(call, call.connectedAt ? 'completed' : call.state === 'ringing' ? 'cancelled' : 'failed', 'dropped');
      return { ok: true, call: null };
    }
    // `elsewhere`: this call lives in another tab of the same account.
    const elsewhere = role === 'caller' ? !here : call.state === 'active' && !here;
    return { ok: true, call: this.view(call, role), elsewhere };
  }

  /** End any call between two people (they were blocked, or one deleted their account). */
  async endBetween(a: string, b: string, reason: EndReason = 'blocked') {
    for (const c of [...this.calls.values()]) {
      if (c.ended) continue;
      if ((c.callerId === a && c.calleeId === b) || (c.callerId === b && c.calleeId === a)) {
        await this.finish(c, c.connectedAt ? 'completed' : c.state === 'ringing' ? 'cancelled' : 'failed', reason);
      }
    }
  }

  isInCall(userId: string) {
    return this.byUser.has(userId);
  }

  /* ------------------------------------------------------------------ internals */

  private isParticipantDevice(call: Call, userId: string, device: string) {
    return (call.callerId === userId && call.callerDevice === device) || (call.calleeId === userId && call.calleeDevice === device);
  }

  private ringingFor(userId: string): Call | undefined {
    return [...this.calls.values()].find((c) => !c.ended && c.state === 'ringing' && c.calleeId === userId);
  }

  private summary(u: UserRow): PeerSummary {
    return { id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url };
  }

  private view(call: Call, role: 'caller' | 'callee'): CallView {
    return {
      callId: call.id,
      conversationId: call.conversationId,
      kind: call.kind,
      state: call.state,
      role,
      // `peer` is the other person: for the caller that is the callee, and for the callee, the caller.
      peer: role === 'caller' ? call.calleeInfo : call.callerInfo,
      elapsedMs: call.connectedAt ? Date.now() - call.connectedAt : null,
      ringLeftMs: Math.max(0, call.createdAt + timing.ringMs - Date.now()),
    };
  }

  /** Checked every couple of seconds: people who disappeared, calls that never connected. */
  private sweep() {
    const now = Date.now();
    const { rt } = this.ctx;
    for (const call of [...this.calls.values()]) {
      if (call.ended) continue;
      const callerHere = rt.deviceOnline(call.callerDevice);
      const calleeHere = call.calleeDevice ? rt.deviceOnline(call.calleeDevice) : true;
      call.callerGoneSince = callerHere ? null : (call.callerGoneSince ?? now);
      call.calleeGoneSince = calleeHere ? null : (call.calleeGoneSince ?? now);
      if (call.state === 'ringing') {
        if (call.callerGoneSince && now - call.callerGoneSince > timing.callerGoneRingingMs) void this.finish(call, 'cancelled', 'dropped');
        continue;
      }
      const gone = Math.max(call.callerGoneSince ? now - call.callerGoneSince : 0, call.calleeGoneSince ? now - call.calleeGoneSince : 0);
      if (gone > timing.goneActiveMs) void this.finish(call, call.connectedAt ? 'completed' : 'failed', 'dropped');
      else if (!call.connectedAt && call.answeredAt && now - call.answeredAt > timing.connectDeadlineMs) void this.finish(call, 'failed', 'failed');
    }
  }

  private async finish(call: Call, status: CallStatus, reason: EndReason, by?: string) {
    if (call.ended) return;
    call.ended = true;
    if (call.ringTimer) clearTimeout(call.ringTimer);
    const endedAt = Date.now();
    const ms = status === 'completed' && call.connectedAt ? Math.max(0, endedAt - call.connectedAt) : 0;
    if (this.byUser.get(call.callerId) === call.id) this.byUser.delete(call.callerId);
    if (this.byUser.get(call.calleeId) === call.id) this.byUser.delete(call.calleeId);
    this.calls.delete(call.id);

    const payload = { callId: call.id, reason, status, endedBy: by ?? null, durationMs: ms };
    this.ctx.rt.emitToUser(call.callerId, 'call:ended', payload);
    this.ctx.rt.emitToUser(call.calleeId, 'call:ended', payload);

    try {
      const conv = (await this.ctx.db.prepare('SELECT ttl_seconds FROM conversations WHERE id = ?').get(call.conversationId)) as { ttl_seconds: number | null } | undefined;
      if (conv) {
        await this.log({ conversationId: call.conversationId, callerId: call.callerId, calleeId: call.calleeId, kind: call.kind, status, ms, ttl: conv.ttl_seconds ?? 0 });
      }
    } catch {
      /* the chat line is a record, not the call: never let a database hiccup leave a call stuck */
    }
  }

  /** Writes the call into the chat as a message from the caller and tells both people. */
  private async log(o: { conversationId: string; callerId: string; calleeId: string; kind: CallKind; status: CallStatus; ms: number; ttl: number }) {
    const { db, rt } = this.ctx;
    const mid = newId();
    const ts = Date.now();
    const expiresAt = o.ttl > 0 ? ts + o.ttl * 1000 : null;
    await db.transaction(async () => {
      await db
        .prepare(
          `INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind, call_kind, call_status, call_ms, expires_at)
           VALUES (?, ?, ?, '', ?, 'call', ?, ?, ?, ?)`,
        )
        .run(mid, o.conversationId, o.callerId, ts, o.kind, o.status, o.ms, expiresAt);
      await db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(ts, o.conversationId);
      // The caller has seen their own call. A call that was missed should surface in the callee's inbox again.
      await db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(ts, o.conversationId, o.callerId);
      if (o.status === 'missed' || o.status === 'cancelled' || o.status === 'busy') {
        await db.prepare('UPDATE conversation_members SET archived_at = NULL WHERE conversation_id = ? AND user_id = ?').run(o.conversationId, o.calleeId);
      }
    });
    const row = (await db.prepare('SELECT * FROM messages WHERE id = ?').get(mid)) as MessageRow;
    for (const uid of [o.callerId, o.calleeId]) {
      const view = (await messageViews(this.ctx, uid, [row]))[0]!;
      rt.emitToUser(uid, 'message:new', { conversationId: o.conversationId, message: view });
    }
  }
}

