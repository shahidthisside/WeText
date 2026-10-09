import { formatDuration } from './call-quality';
import { queryClient } from './query';
import type { Conversation, Message } from './types';

/** The 8-emoji reaction set, matching the server's MESSAGE_REACTIONS. */
export const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙏', '🔥', '👎'] as const;

/** Disappearing-message options shown in the info sheet (seconds). */
export const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 86400, label: '24 hours' },
  { value: 604800, label: '7 days' },
  { value: 7776000, label: '90 days' },
];

export function ttlLabel(seconds: number): string {
  return TTL_OPTIONS.find((o) => o.value === seconds)?.label ?? 'Off';
}

export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEdit(m: Message, meId: string, now = Date.now()): boolean {
  return (
    m.senderId === meId &&
    !m.deleted &&
    !m.forwarded &&
    !m.audio &&
    !m.sharedPost &&
    !m.pending &&
    !m.failed &&
    now - m.createdAt <= EDIT_WINDOW_MS
  );
}

export type MsgPages = { pages: { items: Message[]; hasMore: boolean }[]; pageParams: (number | null)[] };

/** Replace a single message in the thread cache (matched by id). */
export function replaceMessage(conversationId: string, msg: Message, matchId = msg.id) {
  queryClient.setQueryData<MsgPages>(['messages', conversationId], (d) =>
    d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === matchId ? msg : x)) })) } : d,
  );
}

/** Remove a message from the thread cache (used by delete-for-me). */
export function removeMessage(conversationId: string, id: string) {
  queryClient.setQueryData<MsgPages>(['messages', conversationId], (d) =>
    d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.filter((x) => x.id !== id) })) } : d,
  );
}

/** Append an optimistic message to the newest page. */
export function appendMessage(conversationId: string, msg: Message) {
  queryClient.setQueryData<MsgPages>(['messages', conversationId], (d) => {
    if (!d) return d;
    const pages = [...d.pages];
    pages[0] = { ...pages[0]!, items: [...pages[0]!.items, msg] };
    return { ...d, pages };
  });
}

export interface CallSummary {
  /** "Missed voice call", "Outgoing video call"... */
  text: string;
  /** Talk time such as "2:31", or empty. */
  detail: string;
  /** Show in red: a call the viewer did not get to answer. */
  missed: boolean;
  kind: 'audio' | 'video';
}

/** How a call line reads for the person looking at it. The caller is the sender of the line. */
export function callSummary(m: Pick<Message, 'senderId' | 'call'>, meId: string): CallSummary | null {
  const c = m.call;
  if (!c) return null;
  const mine = m.senderId === meId;
  const noun = c.kind === 'video' ? 'video call' : 'voice call';
  const Noun = c.kind === 'video' ? 'Video call' : 'Voice call';
  const detail = c.status === 'completed' && c.durationMs > 0 ? formatDuration(c.durationMs) : '';
  const base = { detail, kind: c.kind };
  switch (c.status) {
    case 'completed':
      return { ...base, text: `${mine ? 'Outgoing' : 'Incoming'} ${noun}`, missed: false };
    case 'declined':
      return { ...base, text: mine ? `${Noun} declined` : `You declined a ${noun}`, missed: false };
    case 'missed':
      return { ...base, text: mine ? 'No answer' : `Missed ${noun}`, missed: !mine };
    case 'cancelled':
      return { ...base, text: mine ? `Cancelled ${noun}` : `Missed ${noun}`, missed: !mine };
    case 'busy':
      return { ...base, text: mine ? 'Line busy' : `Missed ${noun}`, missed: !mine };
    default:
      return { ...base, text: `${Noun} failed`, missed: false };
  }
}

/** Does this message count towards the unread badge? Calls only do when the viewer missed them. */
export function countsAsUnreadMessage(m: Pick<Message, 'kind' | 'call' | 'senderId'>, meId: string): boolean {
  if (m.senderId === meId || m.kind === 'system') return false;
  if (m.kind === 'call') return m.call?.status === 'missed' || m.call?.status === 'cancelled' || m.call?.status === 'busy';
  return true;
}

/** A short, list-friendly summary of a conversation's last message. */
export function previewText(c: Conversation, meId: string): string {
  const lm = c.lastMessage;
  if (c.isGroup && c.left) return 'You left';
  if (!lm) return c.isGroup ? 'No messages yet' : 'Say hi 👋';
  // System lines render as plain text: "<Actor> <body>".
  if (lm.kind === 'system') {
    const name = lm.senderId === meId ? 'You' : lm.sender?.displayName ?? 'Someone';
    return `${name} ${lm.body}`;
  }
  if (lm.kind === 'call') {
    const s = callSummary(lm, meId);
    return s ? `${s.kind === 'video' ? '📹' : '📞'} ${s.text}${s.detail ? ` · ${s.detail}` : ''}` : 'Call';
  }
  if (lm.deleted) return 'Message unsent';
  // Group previews are prefixed with the sender's first name (or "You").
  const prefix = c.isGroup
    ? (lm.senderId === meId ? 'You: ' : `${firstName(lm.sender?.displayName) || 'Someone'}: `)
    : lm.senderId === meId
      ? 'You: '
      : '';
  if (lm.body) return prefix + lm.body;
  if (lm.audio) return prefix + '🎤 Voice message';
  if (lm.sharedPost) return prefix + '📝 Shared a note';
  if (lm.image) return prefix + '📷 Photo';
  return prefix;
}

/** The first word of a display name, for compact group previews ("Ana: hi"). */
export function firstName(displayName?: string | null): string {
  if (!displayName) return '';
  return displayName.trim().split(/\s+/)[0] ?? '';
}

/** A conversation's display name: the group title or the other person's name. */
export function convTitle(c: Conversation): string {
  if (c.isGroup) return c.title ?? 'Group';
  return c.other?.displayName ?? 'Conversation';
}

/** Up-to-two-letter initials for a group avatar fallback. */
export function groupInitials(title?: string): string {
  const words = (title ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '#';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * A stable, pleasant colour for a group member's name, derived from their id.
 * The palette avoids the accent colour and reads on paper surfaces.
 */
const NAME_COLORS = [
  '#b4541f', // sienna
  '#1f6f8b', // teal
  '#8a4fb0', // violet
  '#2e7d4f', // green
  '#b0346b', // rose
  '#5a5fd0', // indigo
  '#9a6a1f', // amber
  '#2f7fa6', // sky
  '#8a5a2b', // walnut
  '#4a7a2f', // olive
] as const;

export function memberColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length]!;
}

/* --------------------------------------------------- Left-group bookkeeping
 *
 * The server marks a conversation `left: true` for both "I left" and "I was
 * removed", but a removed member can't see the "removed X" system line (it sits
 * at their left_at cutoff). To show the right banner, we record locally when the
 * viewer themselves taps Leave; anything else marked `left` was a removal.
 */
const LEFT_KEY = 'wt:left-groups:v1';

function readLeftSet(): Set<string> {
  try {
    const raw = localStorage.getItem(LEFT_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Record that the viewer left this group themselves. */
export function markSelfLeft(conversationId: string) {
  try {
    const s = readLeftSet();
    s.add(conversationId);
    localStorage.setItem(LEFT_KEY, JSON.stringify([...s]));
  } catch {
    /* best-effort */
  }
}

/** Did the viewer leave this group themselves (vs being removed)? */
export function didSelfLeave(conversationId: string): boolean {
  return readLeftSet().has(conversationId);
}

/* ---------------------------------------------------------------- Drafts */

const DRAFT_PREFIX = 'wt:draft:v1:';

/** Read a saved draft for a conversation; corrupt JSON is treated as empty. */
export function readDraft(conversationId: string): string {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + conversationId);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
}

/** Persist (or clear) a draft. Empty strings remove the key. */
export function writeDraft(conversationId: string, text: string) {
  try {
    const key = DRAFT_PREFIX + conversationId;
    if (text.trim()) localStorage.setItem(key, JSON.stringify({ text, at: Date.now() }));
    else localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable; drafts are best-effort */
  }
}

export function clearDraft(conversationId: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + conversationId);
  } catch {
    /* ignore */
  }
}

/** A gentle vibration on long-press, where supported. */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
