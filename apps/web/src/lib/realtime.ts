import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useMe } from './auth';
import { queryClient } from './query';
import { connectSocket, disconnectSocket, getSocket } from './socket';
import type { Conversation, Counts, Message } from './types';

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
      // Append to an open thread (dedupe by id; replace optimistic copy if present).
      queryClient.setQueryData<{ pages: { items: Message[]; hasMore: boolean }[]; pageParams: unknown[] }>(['messages', p.conversationId], (data) => {
        if (!data) return data;
        const all = data.pages.flatMap((pg) => pg.items);
        if (all.some((m) => m.id === p.message.id)) return data;
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
        const updated: Conversation = {
          ...c,
          lastMessage: p.message,
          updatedAt: p.message.createdAt,
          unread: fromOther && !viewing ? c.unread + 1 : c.unread,
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
          if (!conv?.muted && !window.location.pathname.startsWith('/chats')) {
            toast(conv ? conv.other.displayName : 'New message', {
              description: p.message.body || (p.message.image ? 'Sent a photo' : ''),
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

    const onRead = (p: { conversationId: string; userId: string; at: number }) => {
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (data) =>
        data
          ? {
              items: data.items.map((c) =>
                c.id !== p.conversationId ? c : p.userId === me.id ? { ...c, unread: 0 } : { ...c, otherLastReadAt: p.at },
              ),
            }
          : data,
      );
      queryClient.setQueryData<{ conversation: Conversation }>(['conversation', p.conversationId], (d) =>
        d && p.userId !== me.id ? { conversation: { ...d.conversation, otherLastReadAt: p.at } } : d,
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
    s.on('conversation:read', onRead);
    s.io.on('reconnect', onReconnect);
    return () => {
      s.off('notification', onNotification);
      s.off('message:new', onMessage);
      s.off('message:updated', onMessageUpdated);
      s.off('conversation:read', onRead);
      s.io.off('reconnect', onReconnect);
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
