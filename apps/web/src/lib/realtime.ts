import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useMe } from './auth';
import { queryClient } from './query';
import { callSummary, countsAsUnreadMessage } from './chat';
import { connectSocket, disconnectSocket, getSocket } from './socket';
import type { Conversation, Counts, Message } from './types';

/* ---------------------------------------------------------------- Typing store
 *
 * Typing/recording indicators are driven by a single global socket listener
 * (registered once in `useRealtime`, which is mounted once in the layout). A
 * per-conversation thread then subscribes with `useTyping(id)`. Keeping this in
 * a module store — rather than in the Thread's own effect — avoids duplicate
 * listeners from the phone-portal + desktop dual-mount and from StrictMode, both
 * of which otherwise cause state updates to land on an unmounted instance.
 */
export interface TypingActivity {
  userId: string;
  kind: 'typing' | 'recording';
  until: number;
}
// conversationId -> (userId -> activity)
const typingByConv = new Map<string, Map<string, TypingActivity>>();
const typingListeners = new Set<() => void>();
// A monotonically increasing snapshot token per conversation so getSnapshot can
// return a stable, cached array reference (required by useSyncExternalStore).
const typingSnapshot = new Map<string, TypingActivity[]>();

function emitTyping() {
  typingListeners.forEach((l) => l());
}

function recomputeSnapshot(convId: string) {
  const m = typingByConv.get(convId);
  const now = Date.now();
  const list = m ? [...m.values()].filter((a) => a.until > now) : [];
  typingSnapshot.set(convId, list);
}

function setTypingActivity(convId: string, userId: string, kind: 'typing' | 'recording', ttl: number) {
  let m = typingByConv.get(convId);
  if (!m) typingByConv.set(convId, (m = new Map()));
  m.set(userId, { userId, kind, until: Date.now() + ttl });
  recomputeSnapshot(convId);
  emitTyping();
}

function clearTypingActivity(convId: string, userId: string, kind?: 'typing' | 'recording') {
  const m = typingByConv.get(convId);
  if (!m) return;
  const cur = m.get(userId);
  // When a specific kind is requested, only clear if it matches, so a stray
  // recording:off (VoiceRecorderControl emits one on mount) can't wipe an active
  // typing indicator.
  if (kind && cur && cur.kind !== kind) return;
  if (m.delete(userId)) {
    recomputeSnapshot(convId);
    emitTyping();
  }
}

const EMPTY: TypingActivity[] = [];

/** Subscribe to the active typers/recorders in a conversation. */
export function useTyping(conversationId: string): TypingActivity[] {
  return useSyncExternalStore(
    (cb) => {
      typingListeners.add(cb);
      return () => typingListeners.delete(cb);
    },
    () => typingSnapshot.get(conversationId) ?? EMPTY,
    () => EMPTY,
  );
}

/**
 * Wires socket events into the React Query cache. Mounted once in the
 * authenticated layout.
 */
export function useRealtime() {
  const { me } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (!me) return;
    const s = connectSocket();

    const onNotification = (p: { unread: number; type?: string }) => {
      queryClient.setQueryData<Counts>(['counts'], (c) => (c ? { ...c, notifications: p.unread } : c));
      if (p.type) queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (p.type === 'follow_request') queryClient.invalidateQueries({ queryKey: ['counts'] });
    };

    const onMessage = (p: { conversationId: string; message: Message }) => {
      // A new message from someone clears their typing/recording indicator.
      if (p.message.senderId !== me.id) clearTypingActivity(p.conversationId, p.message.senderId);
      // Append to an open thread (dedupe by id; replace optimistic copy if present).
      queryClient.setQueryData<{ pages: { items: Message[]; hasMore: boolean }[]; pageParams: unknown[] }>(['messages', p.conversationId], (data) => {
        if (!data) return data;
        const all = data.pages.flatMap((pg) => pg.items);
        if (all.some((m) => m.id === p.message.id)) return data;
        // The server echoes my own message over the socket, sometimes before the HTTP reply arrives. Let it take
        // over the matching pending bubble in place, so there is never a second copy and the bubble never remounts.
        if (p.message.senderId === me.id) {
          const same = (m: Message) =>
            !!m.pending &&
            m.id.startsWith('tmp-') &&
            m.body.replace(/\s+/g, ' ').trim() === p.message.body.replace(/\s+/g, ' ').trim() &&
            (m.image?.url ?? null) === (p.message.image?.url ?? null) &&
            (m.audio?.url ?? null) === (p.message.audio?.url ?? null) &&
            (m.replyTo?.id ?? null) === (p.message.replyTo?.id ?? null);
          const pend = all.find(same);
          if (pend) {
            let adopted = false;
            return {
              ...data,
              pages: data.pages.map((pg) => ({
                ...pg,
                items: pg.items.map((m) => (!adopted && m.id === pend.id ? ((adopted = true), { ...p.message, clientKey: m.clientKey ?? m.id }) : m)),
              })),
            };
          }
        }
        const pages = [...data.pages];
        const first = pages[0]!;
        pages[0] = { ...first, items: [...first.items, p.message] };
        return { ...data, pages };
      });
      const viewing = window.location.pathname === `/chats/${p.conversationId}` && document.visibilityState === 'visible';
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (data) => {
        if (!data) return data;
        const idx = data.items.findIndex((c) => c.id === p.conversationId);
        if (idx === -1) return data;
        const c = data.items[idx]!;
        const fromOther = p.message.senderId !== me.id;
        const countsAsUnread = fromOther && !viewing && countsAsUnreadMessage(p.message, me.id);
        const updated: Conversation = {
          ...c,
          lastMessage: p.message,
          updatedAt: p.message.createdAt,
          unread: countsAsUnread ? c.unread + 1 : c.unread,
        };
        return { items: [updated, ...data.items.filter((_, i) => i !== idx)] };
      });
      if (p.message.senderId !== me.id) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        if (!viewing) {
          queryClient.invalidateQueries({ queryKey: ['counts'] });
          const conv = queryClient
            .getQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] })
            .flatMap(([, d]) => d?.items ?? [])
            .find((c) => c.id === p.conversationId);
          // Of the call lines, only calls I missed are worth a pop-up; one that just finished is not news.
          const quietCall = p.message.kind === 'call' && !callSummary(p.message, me.id)?.missed;
          if (!conv?.muted && !quietCall && !window.location.pathname.startsWith('/chats')) {
            const who = conv?.isGroup
              ? conv.title ?? 'New message'
              : p.message.sender?.displayName ?? conv?.other?.displayName ?? 'New message';
            const callLine = callSummary(p.message, me.id);
            const desc =
              p.message.kind === 'call'
                ? callLine?.text ?? 'Call'
                : p.message.kind === 'system'
                ? `${p.message.sender?.displayName ?? 'Someone'} ${p.message.body}`
                : (conv?.isGroup && p.message.sender ? `${p.message.sender.displayName}: ` : '') +
                  (p.message.body || (p.message.audio ? 'Voice message' : p.message.sharedPost ? 'Shared a note' : p.message.image ? 'Sent a photo' : ''));
            toast(who, {
              description: desc,
              action: { label: 'Open', onClick: () => navigate(`/chats/${p.conversationId}`) },
            });
          }
        }
      }
    };

    const onMessageUpdated = (p: { conversationId: string; message: Message }) => {
      queryClient.setQueryData<{ pages: { items: Message[] }[] }>(['messages', p.conversationId], (data) =>
        data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: pg.items.map((m) => (m.id === p.message.id ? p.message : m)) })) } : data,
      );
    };

    const onConversationUpdated = (p: { conversationId: string; ttlSeconds?: number; title?: string }) => {
      const patch: Partial<Conversation> = {};
      if (p.ttlSeconds !== undefined) patch.ttlSeconds = p.ttlSeconds;
      if (p.title !== undefined) patch.title = p.title;
      queryClient.setQueryData<{ conversation: Conversation }>(['conversation', p.conversationId], (d) =>
        d ? { conversation: { ...d.conversation, ...patch } } : d,
      );
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (d) =>
        d ? { items: d.items.map((c) => (c.id === p.conversationId ? { ...c, ...patch } : c)) } : d,
      );
    };

    // Group membership / roles / title changed: refetch the view and the list.
    const onMembers = (p: { conversationId: string }) => {
      // Refetch the group view + list. Use refetch (not full invalidate reset) so an open
      // thread/info sheet keeps its data (placeholderData) and doesn't flash a spinner.
      queryClient.invalidateQueries({ queryKey: ['conversation', p.conversationId], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
    };

    // Typing / recording indicators feed the module typing store.
    const onTyping = (p: { conversationId: string; userId?: string }) => {
      if (p.userId) setTypingActivity(p.conversationId, p.userId, 'typing', 3500);
    };
    const onRecording = (p: { conversationId: string; on: boolean; userId?: string }) => {
      if (!p.userId) return;
      if (p.on) setTypingActivity(p.conversationId, p.userId, 'recording', 8000);
      else clearTypingActivity(p.conversationId, p.userId, 'recording');
    };

    const onRead = (p: { conversationId: string; userId: string; at: number }) => {
      const applyReadBy = (c: Conversation): Conversation => {
        if (p.userId === me.id) return { ...c, unread: 0 };
        if (c.isGroup) {
          const readBy = c.readBy ? [...c.readBy] : [];
          const idx = readBy.findIndex((r) => r.userId === p.userId);
          if (idx >= 0) readBy[idx] = { userId: p.userId, at: p.at };
          else readBy.push({ userId: p.userId, at: p.at });
          return { ...c, readBy };
        }
        return { ...c, otherLastReadAt: p.at };
      };
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (data) =>
        data ? { items: data.items.map((c) => (c.id !== p.conversationId ? c : applyReadBy(c))) } : data,
      );
      queryClient.setQueryData<{ conversation: Conversation }>(['conversation', p.conversationId], (d) =>
        d && p.userId !== me.id ? { conversation: applyReadBy(d.conversation) } : d,
      );
      if (p.userId === me.id) queryClient.invalidateQueries({ queryKey: ['counts'] });
    };

    const onReconnect = () => {
      // Catch up on anything missed while disconnected.
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    };

    s.on('notification', onNotification);
    s.on('message:new', onMessage);
    s.on('message:updated', onMessageUpdated);
    s.on('conversation:updated', onConversationUpdated);
    s.on('conversation:members', onMembers);
    s.on('conversation:read', onRead);
    s.on('typing', onTyping);
    s.on('recording', onRecording);
    s.io.on('reconnect', onReconnect);
    // Expire stale typing/recording entries so indicators clear on their own.
    const typingCleaner = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [convId, m] of typingByConv) {
        for (const [uid, a] of m) if (a.until <= now) { m.delete(uid); changed = true; }
        if (changed) recomputeSnapshot(convId);
      }
      if (changed) emitTyping();
    }, 1500);
    return () => {
      s.off('notification', onNotification);
      s.off('message:new', onMessage);
      s.off('message:updated', onMessageUpdated);
      s.off('conversation:updated', onConversationUpdated);
      s.off('conversation:members', onMembers);
      s.off('conversation:read', onRead);
      s.off('typing', onTyping);
      s.off('recording', onRecording);
      s.io.off('reconnect', onReconnect);
      clearInterval(typingCleaner);
    };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!me) disconnectSocket();
  }, [me]);

}

/** Subscribe to presence for a set of user ids; returns nothing, updates via callback. */
export function usePresence(ids: string[], onChange: (userId: string, online: boolean, lastSeenAt: number | null) => void) {
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    const s = getSocket();
    const list = key.split(',');
    const watch = () => s.emit('presence:watch', list);
    const onSnap = (rows: { userId: string; online: boolean; lastSeenAt: number | null }[]) => rows.forEach((r) => onChange(r.userId, r.online, r.lastSeenAt));
    const onPresence = (p: { userId: string; online: boolean; lastSeenAt: number | null }) => list.includes(p.userId) && onChange(p.userId, p.online, p.lastSeenAt);
    s.on('presence:snapshot', onSnap);
    s.on('presence', onPresence);
    s.on('connect', watch);
    if (s.connected) watch();
    return () => {
      s.off('presence:snapshot', onSnap);
      s.off('presence', onPresence);
      s.off('connect', watch);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
