import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { api, makeApp, signup, type TestUser } from './helpers.js';

let app: FastifyInstance;
let alice: TestUser, bob: TestUser, cara: TestUser, dave: TestUser, eve: TestUser;

beforeAll(async () => {
  app = await makeApp();
  alice = await signup(app, 'alice');
  bob = await signup(app, 'bob');
  cara = await signup(app, 'cara');
  dave = await signup(app, 'dave');
  eve = await signup(app, 'eve');
});
afterAll(async () => {
  await app.close();
});

const dbOf = () => app.ctx.db;

async function makeGroup(creator: TestUser, title: string, memberIds: string[]) {
  return api(app, creator).post('/api/conversations/group', { title, memberIds });
}

async function send(me: TestUser, convId: string, body: Record<string, unknown>) {
  return api(app, me).post(`/api/conversations/${convId}/messages`, body);
}

describe('group creation + validation', () => {
  it('creates a group, makes the creator an admin, inserts a system message', async () => {
    const r = await makeGroup(alice, 'Trip', [bob.id, cara.id]);
    expect(r.statusCode, r.body).toBe(201);
    const conv = r.json().conversation;
    expect(conv.isGroup).toBe(true);
    expect(conv.title).toBe('Trip');
    expect(conv.other).toBe(null);
    expect(conv.memberCount).toBe(3);
    expect(conv.myRole).toBe('admin');
    expect(conv.createdBy).toBe(alice.id);
    expect(conv.canSend).toBe(true);
    expect(conv.isRequest).toBe(false);
    expect(conv.otherLastReadAt).toBe(0);
    expect(Array.isArray(conv.readBy)).toBe(true);
    const roles = Object.fromEntries(conv.members.map((m: { id: string; role: string }) => [m.id, m.role]));
    expect(roles[alice.id]).toBe('admin');
    expect(roles[bob.id]).toBe('member');
    // The creation system message is the last message.
    expect(conv.lastMessage.kind).toBe('system');
    expect(conv.lastMessage.body).toBe('created the group');
  });

  it('rejects a title that is empty or too long', async () => {
    expect((await makeGroup(alice, '   ', [bob.id, cara.id])).statusCode).toBe(400);
    expect((await makeGroup(alice, 'x'.repeat(51), [bob.id, cara.id])).statusCode).toBe(400);
  });

  it('requires at least 2 other members and de-dupes / drops self', async () => {
    expect((await makeGroup(alice, 'solo', [bob.id])).statusCode).toBe(400);
    // self + one duplicate collapses below the minimum
    expect((await makeGroup(alice, 'dup', [bob.id, bob.id, alice.id])).statusCode).toBe(400);
  });

  it('rejects a member whose DM policy forbids it, listing the username, and creates nothing', async () => {
    const picky = await signup(app, 'picky', { dmPolicy: 'nobody' });
    const before = (await api(app, alice).get('/api/conversations')).json().items.length;
    const r = await makeGroup(alice, 'nope', [bob.id, picky.id]);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/picky/);
    const after = (await api(app, alice).get('/api/conversations')).json().items.length;
    expect(after).toBe(before);
  });

  it('rejects a blocked member', async () => {
    const foe = await signup(app, 'foe');
    await api(app, foe).post('/api/users/alice/block');
    const r = await makeGroup(alice, 'blk', [bob.id, foe.id]);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/foe/);
  });

  it('enforces the 50-member cap', async () => {
    // 49 others + creator = 50 is allowed; 50 others would be 51 total and schema caps memberIds at 49.
    const ids = Array.from({ length: 50 }, (_, i) => `fake${i}`);
    const r = await makeGroup(alice, 'big', ids);
    expect(r.statusCode).toBe(400); // zod max 49 memberIds
  });
});

describe('group view for creator / member / non-member', () => {
  it('members see the group; a non-member gets 404', async () => {
    const conv = (await makeGroup(alice, 'View', [bob.id, cara.id])).json().conversation;
    expect((await api(app, bob).get(`/api/conversations/${conv.id}`)).statusCode).toBe(200);
    expect((await api(app, dave).get(`/api/conversations/${conv.id}`)).statusCode).toBe(404);
    const bView = (await api(app, bob).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(bView.myRole).toBe('member');
    expect(bView.isGroup).toBe(true);
  });

  it('appears in the conversation list for all tabs logic (primary) and shows the title', async () => {
    const conv = (await makeGroup(alice, 'Listed', [bob.id, cara.id])).json().conversation;
    const list = (await api(app, bob).get('/api/conversations')).json().items;
    const found = list.find((c: { id: string }) => c.id === conv.id);
    expect(found).toBeTruthy();
    expect(found.title).toBe('Listed');
    expect(found.isRequest).toBe(false);
  });
});

describe('messages in groups: kind + sender + CRUD', () => {
  it('includes kind and sender on every group message view', async () => {
    const conv = (await makeGroup(alice, 'Msgs', [bob.id, cara.id])).json().conversation;
    const sent = await send(bob, conv.id, { body: 'hi all' });
    expect(sent.statusCode).toBe(201);
    const m = sent.json().message;
    expect(m.kind).toBe('user');
    expect(m.sender).toMatchObject({ id: bob.id, username: 'bob' });
  });

  it('edit/unsend only own messages; admins may NOT unsend others', async () => {
    const conv = (await makeGroup(alice, 'Edit', [bob.id, cara.id])).json().conversation;
    const m = (await send(bob, conv.id, { body: 'mine' })).json().message;
    expect((await api(app, bob).patch(`/api/messages/${m.id}`, { body: 'edited' })).statusCode).toBe(200);
    // alice is admin but cannot unsend bob's message
    expect((await api(app, alice).del(`/api/messages/${m.id}`)).statusCode).toBe(403);
    expect((await api(app, bob).del(`/api/messages/${m.id}`)).statusCode).toBe(200);
  });

  it('allows reactions, reply, star, hide, forward for all members', async () => {
    const conv = (await makeGroup(alice, 'React', [bob.id, cara.id])).json().conversation;
    const m = (await send(alice, conv.id, { body: 'original' })).json().message;
    expect((await api(app, cara).put(`/api/messages/${m.id}/reaction`, { emoji: '🔥' })).statusCode).toBe(200);
    const reply = (await send(bob, conv.id, { body: 'reply', replyToId: m.id })).json().message;
    expect(reply.replyTo.body).toBe('original');
    expect((await api(app, cara).put(`/api/messages/${m.id}/star`, { starred: true })).statusCode).toBe(200);
    expect((await api(app, cara).post(`/api/messages/${m.id}/hide`)).statusCode).toBe(200);
    // Forward into another group
    const other = (await makeGroup(alice, 'Target', [bob.id, cara.id])).json().conversation;
    const f = await api(app, alice).post(`/api/messages/${m.id}/forward`, { conversationIds: [other.id] });
    expect(f.json().sent).toBe(1);
  });

  it('search and media work in groups', async () => {
    const conv = (await makeGroup(alice, 'Search', [bob.id, cara.id])).json().conversation;
    await send(alice, conv.id, { body: 'needle in a haystack' });
    const s = (await api(app, bob).get(`/api/conversations/${conv.id}/search?q=needle`)).json();
    expect(s.items.length).toBe(1);
    const media = (await api(app, bob).get(`/api/conversations/${conv.id}/media?kind=image`)).json();
    expect(Array.isArray(media.items)).toBe(true);
  });

  it('non-member cannot send (404) and sending requires active membership', async () => {
    const conv = (await makeGroup(alice, 'Guard', [bob.id, cara.id])).json().conversation;
    expect((await send(dave, conv.id, { body: 'intruder' })).statusCode).toBe(404);
  });
});

describe('membership management', () => {
  it('admin adds members; a new member only sees messages from joined_at onward', async () => {
    const conv = (await makeGroup(alice, 'Join', [bob.id, cara.id])).json().conversation;
    await send(alice, conv.id, { body: 'before dave' });
    const add = await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: [dave.id] });
    expect(add.statusCode, add.body).toBe(200);
    // system message 'added DAVE'
    const list = (await api(app, dave).get(`/api/conversations/${conv.id}/messages`)).json().items;
    const bodies = list.map((m: { body: string; kind: string }) => m.body);
    expect(bodies).not.toContain('before dave');
    expect(bodies.some((b: string) => b.includes('added DAVE'))).toBe(true);
    // After dave is added, a new message IS visible
    await send(bob, conv.id, { body: 'after dave' });
    const list2 = (await api(app, dave).get(`/api/conversations/${conv.id}/messages`)).json().items;
    expect(list2.map((m: { body: string }) => m.body)).toContain('after dave');
  });

  it('non-admin cannot add / remove others / rename / promote', async () => {
    const conv = (await makeGroup(alice, 'Perms', [bob.id, cara.id])).json().conversation;
    expect((await api(app, bob).post(`/api/conversations/${conv.id}/members`, { userIds: [dave.id] })).statusCode).toBe(403);
    expect((await api(app, bob).del(`/api/conversations/${conv.id}/members/${cara.id}`)).statusCode).toBe(403);
    expect((await api(app, bob).patch(`/api/conversations/${conv.id}`, { title: 'hacked' })).statusCode).toBe(403);
    expect((await api(app, bob).patch(`/api/conversations/${conv.id}/members/${cara.id}`, { role: 'admin' })).statusCode).toBe(403);
  });

  it('admin renames the group; non-group PATCH title is rejected', async () => {
    const conv = (await makeGroup(alice, 'Old', [bob.id, cara.id])).json().conversation;
    const r = await api(app, alice).patch(`/api/conversations/${conv.id}`, { title: 'New Name' });
    expect(r.statusCode).toBe(200);
    expect(r.json().conversation.title).toBe('New Name');
    const oneToOne = (await api(app, alice).post('/api/conversations', { username: 'bob' })).json().conversation;
    expect((await api(app, alice).patch(`/api/conversations/${oneToOne.id}`, { title: 'x' })).statusCode).toBe(400);
  });

  it('removed member can read history up to left_at but cannot send/react; view marked left', async () => {
    const conv = (await makeGroup(alice, 'Remove', [bob.id, cara.id])).json().conversation;
    const m = (await send(alice, conv.id, { body: 'visible to cara' })).json().message;
    expect((await api(app, alice).del(`/api/conversations/${conv.id}/members/${cara.id}`)).statusCode).toBe(200);
    // cara can still read what came before her removal
    const read = await api(app, cara).get(`/api/conversations/${conv.id}/messages`);
    expect(read.statusCode).toBe(200);
    expect(read.json().items.map((x: { body: string }) => x.body)).toContain('visible to cara');
    // but cannot send or react
    expect((await send(cara, conv.id, { body: 'nope' })).statusCode).toBe(403);
    expect((await api(app, cara).put(`/api/messages/${m.id}/reaction`, { emoji: '👍' })).statusCode).toBe(403);
    // view marked left, canSend false
    const v = (await api(app, cara).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(v.left).toBe(true);
    expect(v.canSend).toBe(false);
    // a message sent after cara left is NOT visible to cara
    await send(alice, conv.id, { body: 'after cara left' });
    const read2 = (await api(app, cara).get(`/api/conversations/${conv.id}/messages`)).json();
    expect(read2.items.map((x: { body: string }) => x.body)).not.toContain('after cara left');
  });

  it('leaving yourself works and inserts a "left" system line', async () => {
    const conv = (await makeGroup(alice, 'Leave', [bob.id, cara.id])).json().conversation;
    const r = await api(app, bob).del(`/api/conversations/${conv.id}/members/${bob.id}`);
    expect(r.statusCode).toBe(200);
    const list = (await api(app, alice).get(`/api/conversations/${conv.id}/messages`)).json().items;
    expect(list.some((m: { body: string; kind: string }) => m.kind === 'system' && m.body === 'left')).toBe(true);
  });

  it('promotes the longest-standing member when the last admin leaves', async () => {
    const conv = (await makeGroup(alice, 'Promote', [bob.id, cara.id])).json().conversation;
    // alice is the only admin; when she leaves, bob (first added) becomes admin.
    await api(app, alice).del(`/api/conversations/${conv.id}/members/${alice.id}`);
    const v = (await api(app, bob).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(v.myRole).toBe('admin');
  });

  it('cannot demote the last admin', async () => {
    const conv = (await makeGroup(alice, 'LastAdmin', [bob.id, cara.id])).json().conversation;
    const r = await api(app, alice).patch(`/api/conversations/${conv.id}/members/${alice.id}`, { role: 'member' });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('last_admin');
  });

  it('promote then demote works when another admin exists', async () => {
    const conv = (await makeGroup(alice, 'TwoAdmins', [bob.id, cara.id])).json().conversation;
    expect((await api(app, alice).patch(`/api/conversations/${conv.id}/members/${bob.id}`, { role: 'admin' })).statusCode).toBe(200);
    // now alice can be demoted
    expect((await api(app, bob).patch(`/api/conversations/${conv.id}/members/${alice.id}`, { role: 'member' })).statusCode).toBe(200);
  });

  it('re-adding a member who left resets their join time', async () => {
    const conv = (await makeGroup(alice, 'Readd', [bob.id, cara.id])).json().conversation;
    await send(alice, conv.id, { body: 'era 1' });
    await api(app, cara).del(`/api/conversations/${conv.id}/members/${cara.id}`);
    await send(alice, conv.id, { body: 'era 2 while gone' });
    const re = await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: [cara.id] });
    expect(re.statusCode).toBe(200);
    const v = (await api(app, cara).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(v.left).toBe(false);
    const msgs = (await api(app, cara).get(`/api/conversations/${conv.id}/messages`)).json().items.map((m: { body: string }) => m.body);
    expect(msgs).not.toContain('era 1');
    expect(msgs).not.toContain('era 2 while gone');
  });

  it('members endpoint rejects when the group would exceed 50', async () => {
    const conv = (await makeGroup(alice, 'Capped', [bob.id, cara.id])).json().conversation;
    // Add 47 real members to reach 50, then one more should 409.
    const extra: string[] = [];
    for (let i = 0; i < 47; i++) extra.push((await signup(app, `cap${i}`)).id);
    const r1 = await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: extra.slice(0, 20) });
    expect(r1.statusCode).toBe(200);
    await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: extra.slice(20, 40) });
    const r3 = await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: extra.slice(40, 47) });
    expect(r3.statusCode).toBe(200); // now at 50
    const overflow = (await signup(app, 'overflow')).id;
    const r4 = await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: [overflow] });
    expect(r4.statusCode).toBe(409);
  });
});

describe('read receipts, unread counts, archive', () => {
  it('readBy lists other members with their last_read_at', async () => {
    const conv = (await makeGroup(alice, 'ReadBy', [bob.id, cara.id])).json().conversation;
    await send(alice, conv.id, { body: 'hello' });
    await api(app, bob).post(`/api/conversations/${conv.id}/read`);
    const v = (await api(app, alice).get(`/api/conversations/${conv.id}`)).json().conversation;
    const entry = v.readBy.find((r: { userId: string }) => r.userId === bob.id);
    expect(entry).toBeTruthy();
    expect(entry.at).toBeGreaterThan(0);
    expect(v.readBy.find((r: { userId: string }) => r.userId === alice.id)).toBeUndefined();
  });

  it('counts group unread (excluding system + my own), and system messages do not inflate it', async () => {
    const conv = (await makeGroup(alice, 'Count', [bob.id, cara.id])).json().conversation;
    const before = (await api(app, bob).get('/api/me/counts')).json().messages;
    await send(alice, conv.id, { body: 'ping' });
    const after = (await api(app, bob).get('/api/me/counts')).json().messages;
    expect(after).toBe(before + 1);
    // adding a member (system message) does not add to unread
    await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: [dave.id] });
    const afterSystem = (await api(app, bob).get('/api/me/counts')).json().messages;
    expect(afterSystem).toBe(after);
    // once bob reads, it drops
    await api(app, bob).post(`/api/conversations/${conv.id}/read`);
    const afterRead = (await api(app, bob).get('/api/me/counts')).json().messages;
    expect(afterRead).toBe(before);
  });

  it('a group message never lands in requests', async () => {
    const conv = (await makeGroup(alice, 'NotRequest', [bob.id, cara.id])).json().conversation;
    await send(alice, conv.id, { body: 'yo' });
    const reqs = (await api(app, bob).get('/api/conversations?tab=requests')).json().items;
    expect(reqs.find((c: { id: string }) => c.id === conv.id)).toBeUndefined();
    expect((await api(app, bob).get('/api/me/counts')).json().messageRequests).toBe(0);
  });

  it('auto-unarchives for a recipient when a new non-system message arrives', async () => {
    const conv = (await makeGroup(alice, 'Archive', [bob.id, cara.id])).json().conversation;
    await api(app, bob).patch(`/api/conversations/${conv.id}`, { archived: true });
    expect((await api(app, bob).get(`/api/conversations/${conv.id}`)).json().conversation.archived).toBe(true);
    await send(alice, conv.id, { body: 'wake up' });
    expect((await api(app, bob).get(`/api/conversations/${conv.id}`)).json().conversation.archived).toBe(false);
  });

  it('per-user settings (muted/pinned/markedUnread) work for a member', async () => {
    const conv = (await makeGroup(alice, 'Settings', [bob.id, cara.id])).json().conversation;
    expect((await api(app, cara).patch(`/api/conversations/${conv.id}`, { muted: true, pinned: true })).statusCode).toBe(200);
    const v = (await api(app, cara).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(v.muted).toBe(true);
    expect(v.pinned).toBe(true);
  });

  it('ttlSeconds for groups is admin-only', async () => {
    const conv = (await makeGroup(alice, 'Ttl', [bob.id, cara.id])).json().conversation;
    expect((await api(app, bob).patch(`/api/conversations/${conv.id}`, { ttlSeconds: 86400 })).statusCode).toBe(403);
    expect((await api(app, alice).patch(`/api/conversations/${conv.id}`, { ttlSeconds: 86400 })).statusCode).toBe(200);
  });
});

describe('system message previews + starred + reports + export', () => {
  it('shows a system message as the last-message preview', async () => {
    const conv = (await makeGroup(alice, 'Preview', [bob.id, cara.id])).json().conversation;
    await api(app, alice).post(`/api/conversations/${conv.id}/members`, { userIds: [dave.id] });
    const list = (await api(app, bob).get('/api/conversations')).json().items;
    const found = list.find((c: { id: string }) => c.id === conv.id);
    expect(found.lastMessage.kind).toBe('system');
    expect(found.lastMessage.body).toMatch(/added DAVE/);
  });

  it('starred-messages includes group messages with the group title', async () => {
    const conv = (await makeGroup(alice, 'StarList', [bob.id, cara.id])).json().conversation;
    const m = (await send(alice, conv.id, { body: 'star me' })).json().message;
    await api(app, bob).put(`/api/messages/${m.id}/star`, { starred: true });
    const items = (await api(app, bob).get('/api/me/starred-messages')).json().items;
    const found = items.find((i: { message: { id: string } }) => i.message.id === m.id);
    expect(found).toBeTruthy();
    expect(found.conversation.isGroup).toBe(true);
    expect(found.conversation.title).toBe('StarList');
  });

  it('a member can report a group message (verifies reports.ts membership works for groups)', async () => {
    const conv = (await makeGroup(alice, 'Report', [bob.id, cara.id])).json().conversation;
    const m = (await send(alice, conv.id, { body: 'reportable' })).json().message;
    const r = await api(app, bob).post('/api/reports', { targetType: 'message', targetId: m.id, reason: 'spam' });
    expect(r.statusCode, r.body).toBe(200);
    // a non-member cannot report it
    const r2 = await api(app, eve).post('/api/reports', { targetType: 'message', targetId: m.id, reason: 'spam' });
    expect(r2.statusCode).toBe(403);
  });

  it('export does not break for a user who is in a group', async () => {
    await makeGroup(alice, 'Export', [bob.id, cara.id]);
    const r = await api(app, alice).get('/api/me/export');
    expect(r.statusCode).toBe(200);
  });
});

describe('deleted-user cascade', () => {
  it('group keeps working after a non-creator member deletes their account', async () => {
    const temp = await signup(app, 'temp1');
    const conv = (await makeGroup(alice, 'Cascade', [bob.id, temp.id])).json().conversation;
    await send(temp, conv.id, { body: 'bye soon' });
    const del = await api(app, temp).post('/api/auth/delete-account', { password: 'passw0rd!' });
    expect(del.statusCode).toBe(200);
    // group still loads for alice
    const v = (await api(app, alice).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(v.isGroup).toBe(true);
    // temp is no longer an active member
    expect(v.members.find((m: { id: string }) => m.id === temp.id)).toBeUndefined();
  });

  it('created_by becomes null and an admin is promoted lazily when the creator is deleted', async () => {
    const owner = await signup(app, 'owner1');
    const conv = (await makeGroup(owner, 'OwnerGone', [bob.id, cara.id])).json().conversation;
    await api(app, owner).post('/api/auth/delete-account', { password: 'passw0rd!' });
    // bob (first added) should become admin lazily on view load
    const v = (await api(app, bob).get(`/api/conversations/${conv.id}`)).json().conversation;
    expect(v.createdBy).toBe(null);
    const admins = v.members.filter((m: { role: string }) => m.role === 'admin');
    expect(admins.length).toBeGreaterThanOrEqual(1);
  });
});
