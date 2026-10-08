import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, Hourglass, Info, Search } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useAuthedMe } from '../../lib/auth';
import { usePresence, useTyping } from '../../lib/realtime';
import { queryClient } from '../../lib/query';
import { appendMessage, removeMessage, replaceMessage, ttlLabel, convTitle, firstName, memberColor, didSelfLeave, type MsgPages } from '../../lib/chat';
import type { Conversation, GroupMember, Message } from '../../lib/types';
import { cn, dayLabel, lastSeen } from '../../lib/utils';
import { Lightbox } from '../Media';
import { Avatar, ConfirmDialog, EmptyState, IconButton, PageSpinner, Spinner, VerifiedLock } from '../ui';
import { Bubble } from './Bubble';
import { Composer, type OutgoingMessage } from './Composer';
import { ConversationInfo } from './ConversationInfo';
import { GroupInfo } from './GroupInfo';
import { GroupAvatar } from './GroupAvatar';
import { EditSheet } from './EditSheet';
import { ForwardSheet } from './ForwardSheet';
import { MessageActionSheet, MessageInfoModal, type ActionTarget } from './MessageActions';
import { SearchSheet } from './SearchSheet';
import type { Tick } from './SharedPostCard';

export function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const me = useAuthedMe();
  const [search] = useSearchParams();
  const jumpTo = search.get('m');

  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api.get<{ conversation: Conversation }>(`/conversations/${id}`), retry: false, placeholderData: (prev) => prev });
  const msgs = useInfiniteQuery({
    queryKey: ['messages', id],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => api.get<{ items: Message[]; hasMore: boolean }>(`/conversations/${id}/messages${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => (last.hasMore && last.items[0] ? last.items[0].createdAt : undefined),
    staleTime: Infinity,
  });
  const c = conv.data?.conversation;
  const isGroup = !!c?.isGroup;

  const [online, setOnline] = useState<boolean | null>(null);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const onPresence = useCallback((_u: string, o: boolean, ls: number | null) => {
    setOnline(o);
    setSeenAt(ls);
  }, []);
  usePresence(c && !isGroup && c.other ? [c.other.id] : [], onPresence);

  // Typing/recording activity is driven by a single global store (see realtime.ts),
  // so the phone-portal + desktop dual-mount can't cause lost updates.
  const typers = useTyping(id);

  // Resolve a member's display name for typing/activity labels.
  const memberName = useCallback(
    (userId: string): string => {
      const m = c?.members?.find((mm) => mm.id === userId);
      return firstName(m?.displayName) || 'Someone';
    },
    [c?.members],
  );

  const messages = useMemo(() => (msgs.data ? [...msgs.data.pages].reverse().flatMap((p) => p.items) : []), [msgs.data]);
  const lastIncoming = [...messages].reverse().find((m) => m.senderId !== me.id)?.createdAt ?? 0;

  // Count unread incoming when opening, to place the "New messages" divider.
  const unreadFirstId = useRef<string | null>(null);
  const unreadCountOnOpen = useRef(0);
  useEffect(() => {
    unreadFirstId.current = null;
    unreadCountOnOpen.current = 0;
  }, [id]);
  if (c && unreadFirstId.current === null && c.unread > 0 && messages.length) {
    const incoming = messages.filter((m) => m.senderId !== me.id);
    const firstUnread = incoming[Math.max(0, incoming.length - c.unread)];
    if (firstUnread) {
      unreadFirstId.current = firstUnread.id;
      unreadCountOnOpen.current = c.unread;
    }
  }

  // Mark read.
  useEffect(() => {
    if (!c || !lastIncoming) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      api.post(`/conversations/${id}/read`).catch(() => {});
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (d) =>
        d ? { items: d.items.map((x) => (x.id === id ? { ...x, unread: 0, markedUnread: false } : x)) } : d,
      );
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [id, lastIncoming, !!c]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll management.
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef(0);
  const loadingOlder = useRef(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const lastSeenMsgCount = useRef(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      loadingOlder.current = false;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
      setNewWhileAway(0);
    } else if (messages.length > lastSeenMsgCount.current) {
      setNewWhileAway((n) => n + (messages.length - lastSeenMsgCount.current));
    }
    lastSeenMsgCount.current = messages.length;
  }, [messages.length, typers]);

  const onScroll = () => {
    const el = scroller.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollDown(!atBottom.current);
    if (atBottom.current) setNewWhileAway(0);
    if (el.scrollTop < 200 && msgs.hasNextPage && !msgs.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      loadingOlder.current = true;
      msgs.fetchNextPage();
    }
  };

  function scrollToBottom() {
    const el = scroller.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      atBottom.current = true;
      setNewWhileAway(0);
    }
  }

  // Keep composer above the on-screen keyboard via visualViewport.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const el = rootRef.current;
      if (!el) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.paddingBottom = inset ? `${inset}px` : '';
      if (atBottom.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  // Jump-to-message (search / starred deep link).
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const registerRef = useCallback((mid: string, el: HTMLDivElement | null) => {
    if (el) bubbleRefs.current.set(mid, el);
    else bubbleRefs.current.delete(mid);
  }, []);
  const jump = useCallback((mid: string) => {
    const el = bubbleRefs.current.get(mid);
    if (!el) {
      toast('Message not loaded — scroll up to find it');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(mid);
    setTimeout(() => setHighlightId((h) => (h === mid ? null : h)), 1800);
  }, []);
  useEffect(() => {
    if (jumpTo && messages.length) {
      const t = setTimeout(() => jump(jumpTo), 300);
      return () => clearTimeout(t);
    }
  }, [jumpTo, messages.length, jump]);

  // Sheets / dialogs.
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [editMsg, setEditMsg] = useState<Message | null>(null);
  const [infoMsg, setInfoMsg] = useState<Message | null>(null);
  const [unsendMsg, setUnsendMsg] = useState<Message | null>(null);

  const react = useCallback(
    async (m: Message, emoji: string | null) => {
      try {
        const r = await api.put<{ message: Message }>(`/messages/${m.id}/reaction`, { emoji });
        replaceMessage(id, r.message);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [id],
  );
  const star = useCallback(
    async (m: Message) => {
      try {
        const r = await api.put<{ message: Message }>(`/messages/${m.id}/star`, { starred: !m.starred });
        replaceMessage(id, r.message);
        toast(r.message.starred ? 'Starred' : 'Unstarred');
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [id],
  );
  const deleteForMe = useCallback(
    async (m: Message) => {
      removeMessage(id, m.id);
      try {
        await api.post(`/messages/${m.id}/hide`);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [id],
  );
  async function unsend(m: Message) {
    setUnsendMsg(null);
    try {
      const r = await api.del<{ message: Message }>(`/messages/${m.id}`);
      replaceMessage(id, r.message);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // Send (optimistic, with retry).
  const sendRaw = useCallback(
    async (payload: OutgoingMessage, tempId: string, optimistic: Message) => {
      try {
        const r = await api.post<{ message: Message }>(`/conversations/${id}/messages`, {
          body: payload.body,
          image: payload.image ?? undefined,
          audio: payload.audio ?? undefined,
          replyToId: payload.replyToId ?? undefined,
        });
        queryClient.setQueryData<MsgPages>(['messages', id], (d) => {
          if (!d) return d;
          const exists = d.pages.some((p) => p.items.some((x) => x.id === r.message.id));
          return {
            ...d,
            pages: d.pages.map((p) => ({ ...p, items: exists ? p.items.filter((x) => x.id !== tempId) : p.items.map((x) => (x.id === tempId ? r.message : x)) })),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch (e) {
        replaceMessage(id, { ...optimistic, pending: false, failed: true }, tempId);
        toast.error(errorMessage(e));
      }
    },
    [id],
  );

  const send = useCallback(
    (payload: OutgoingMessage) => {
      const tempId = `tmp-${crypto.randomUUID()}`;
      const reply = payload.replyToId ? messages.find((m) => m.id === payload.replyToId) : null;
      const optimistic: Message = {
        id: tempId,
        conversationId: id,
        senderId: me.id,
        body: payload.body,
        image: payload.image ?? null,
        audio: payload.audio ?? null,
        sharedPost: null,
        replyTo: reply ? { id: reply.id, senderId: reply.senderId, body: reply.body.slice(0, 140), hasImage: !!reply.image, deleted: false } : null,
        createdAt: Date.now(),
        editedAt: null,
        forwarded: false,
        deleted: false,
        expiresAt: null,
        starred: false,
        reactions: [],
        pending: true,
      };
      appendMessage(id, optimistic);
      atBottom.current = true;
      return sendRaw(payload, tempId, optimistic);
    },
    [id, me.id, messages, sendRaw],
  );

  const retry = useCallback(
    (m: Message) => {
      replaceMessage(id, { ...m, pending: true, failed: false });
      sendRaw({ body: m.body, image: m.image, audio: m.audio, replyToId: m.replyTo?.id ?? null }, m.id, m);
    },
    [id, sendRaw],
  );

  if (conv.isError && !conv.data) {
    return (
      <div ref={rootRef} className="flex h-full flex-1 flex-col bg-card">
        <ThreadHeader onBack={onBack} />
        <EmptyState title="Conversation not found" body="It may have been deleted, or you don’t have access." />
      </div>
    );
  }
  if (!c) return <PageSpinner />;

  // --- Group / 1:1 derived view data ---
  const title = convTitle(c);
  const members: GroupMember[] = c.members ?? [];
  const memberById = new Map(members.map((m) => [m.id, m]));
  const anyRecording = typers.some((t) => t.kind === 'recording');
  const anyTyping = typers.length > 0;

  // Group subtitle: typing/recording names, else "N members".
  function groupSubtitle(): { text: string; active: boolean } {
    if (typers.length) {
      const rec = typers.find((t) => t.kind === 'recording');
      if (rec && typers.length === 1) return { text: `${memberName(rec.userId)} is recording audio…`, active: true };
      const names = typers.map((t) => memberName(t.userId));
      if (names.length === 1) return { text: `${names[0]} is typing…`, active: true };
      if (names.length === 2) return { text: `${names[0]} and ${names[1]} are typing…`, active: true };
      return { text: `${names[0]} and ${names.length - 1} others are typing…`, active: true };
    }
    const n = c!.memberCount ?? members.length;
    return { text: `${n} member${n === 1 ? '' : 's'}`, active: false };
  }

  const isOnline = c.other ? (online ?? c.other.isOnline) : false;
  const status = isGroup
    ? null
    : !c.canSend
      ? null
      : anyRecording
        ? 'recording audio…'
        : anyTyping
          ? 'typing…'
          : isOnline
            ? 'Online'
            : lastSeen(seenAt ?? c.other?.lastSeenAt ?? null);
  const lastMine = [...messages].reverse().find((m) => m.senderId === me.id && !m.pending && !m.failed);

  // In a group, "Seen" requires EVERY other active member to have read it.
  const readBy = c.readBy ?? [];
  function seenByAll(createdAt: number): boolean {
    if (!isGroup) return c!.otherLastReadAt >= createdAt;
    if (!readBy.length) return false;
    return readBy.every((r) => r.at >= createdAt);
  }

  function tickFor(m: Message): Tick | null {
    if (m.senderId !== me.id) return null;
    if (m.failed) return 'failed';
    if (m.pending) return 'sending';
    if (m.id !== lastMine?.id) return null;
    return seenByAll(m.createdAt) ? 'seen' : 'sent';
  }

  const sub = isGroup ? groupSubtitle() : null;

  // When I've left a group, distinguish "I left" (recorded locally) from "I was removed".
  let leftReason: 'left' | 'removed' | null = null;
  if (isGroup && c.left) {
    leftReason = didSelfLeave(c.id) ? 'left' : 'removed';
  }

  // For a quoted reply in a group, resolve the original sender's name.
  function replyNameFor(m: Message): string | undefined {
    if (!isGroup || !m.replyTo?.senderId) return undefined;
    if (m.replyTo.senderId === me.id) return 'You';
    const mem = memberById.get(m.replyTo.senderId);
    return mem ? firstName(mem.displayName) || mem.displayName : undefined;
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-1 flex-col bg-card">
      <ThreadHeader onBack={onBack}>
        {isGroup ? (
          <button type="button" onClick={() => setInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Group info">
            <GroupAvatar title={c.title} members={members} size={40} />
            <span className="min-w-0 leading-5">
              <span className="flex items-center gap-1 font-display font-bold">
                <span className="truncate">{title}</span>
              </span>
              <span className={cn('block truncate text-[0.8125rem]', sub?.active ? 'text-accent' : 'text-fg-muted')}>{sub?.text}</span>
            </span>
          </button>
        ) : (
          <Link to={`/${c.other!.username}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar user={c.other} size={40} online={isOnline && c.canSend} />
            <span className="min-w-0 leading-5">
              <span className="flex items-center gap-1 font-display font-bold">
                <span className="truncate">{c.other!.displayName}</span>
                <VerifiedLock show={!!c.other!.isPrivate} />
              </span>
              <span className={cn('block truncate text-[0.8125rem]', anyTyping || anyRecording ? 'text-accent' : 'text-fg-muted')}>{status ?? `@${c.other!.username}`}</span>
            </span>
          </Link>
        )}
        {c.ttlSeconds > 0 && (
          <span className="hidden items-center gap-1 rounded-full bg-bg-muted px-2 py-1 text-[0.75rem] font-semibold text-fg-muted sm:flex" title={`Disappearing: ${ttlLabel(c.ttlSeconds)}`}>
            <Hourglass className="size-3.5" /> {ttlLabel(c.ttlSeconds)}
          </span>
        )}
        <IconButton label="Search in chat" onClick={() => setSearchOpen(true)}>
          <Search className="size-5" />
        </IconButton>
        <IconButton label="Conversation info" onClick={() => setInfo(true)}>
          <Info className="size-5" />
        </IconButton>
      </ThreadHeader>

      {c.ttlSeconds > 0 && (
        <div className="flex items-center justify-center gap-1.5 bg-bg-muted/60 py-1.5 text-[0.75rem] text-fg-muted">
          <Hourglass className="size-3.5" /> Disappearing messages are on · {ttlLabel(c.ttlSeconds)}
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        {msgs.isFetchingNextPage && (
          <div className="flex justify-center py-2 text-accent">
            <Spinner />
          </div>
        )}
        {!msgs.hasNextPage && !msgs.isPending && (
          isGroup ? (
            <button type="button" onClick={() => setInfo(true)} className="mb-6 flex w-full flex-col items-center border-b border-line px-4 pb-8 pt-4 text-center hover:bg-bg-hover/40">
              <GroupAvatar title={c.title} members={members} size={64} />
              <p className="mt-2 font-bold">{title}</p>
              <p className="text-[0.9375rem] text-fg-muted">{(c.memberCount ?? members.length)} members</p>
            </button>
          ) : (
            <Link to={`/${c.other!.username}`} className="mb-6 flex flex-col items-center border-b border-line px-4 pb-8 pt-4 text-center hover:bg-bg-hover/40">
              <Avatar user={c.other} size={64} />
              <p className="mt-2 font-bold">{c.other!.displayName}</p>
              <p className="text-[0.9375rem] text-fg-muted">@{c.other!.username}</p>
              {c.isRequest && <p className="mt-3 max-w-[320px] text-[0.875rem] text-fg-muted">You don’t follow @{c.other!.username}. Reply to accept this request, or block them from the menu.</p>}
            </Link>
          )
        )}
        {msgs.isPending ? (
          <PageSpinner />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();

            // System event lines render as centered muted pills ("Ana added Ben").
            if (m.kind === 'system') {
              const actor = m.senderId === me.id ? 'You' : m.sender?.displayName ?? 'Someone';
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="sticky top-1 z-[1] my-4 flex justify-center">
                      <span className="rounded-full bg-bg-muted px-3 py-1 text-[0.75rem] font-semibold text-fg-muted shadow-sm">{dayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <div className="my-2 flex justify-center" ref={(el) => registerRef(m.id, el)}>
                    <span className="max-w-[85%] rounded-full bg-bg-muted/70 px-3 py-1 text-center text-[0.8125rem] text-fg-muted">
                      {actor} {m.body}
                    </span>
                  </div>
                </Fragment>
              );
            }

            const prevUser = prev && prev.kind !== 'system';
            const nextUser = next && next.kind !== 'system';
            const groupedWithPrev = !!prevUser && !newDay && prev!.senderId === m.senderId && m.createdAt - prev!.createdAt < 5 * 60_000;
            const groupedWithNext = !!nextUser && next!.senderId === m.senderId && next!.createdAt - m.createdAt < 5 * 60_000 && new Date(next!.createdAt).toDateString() === new Date(m.createdAt).toDateString();
            const mine = m.senderId === me.id;
            const senderMember = isGroup && !mine ? memberById.get(m.senderId) : undefined;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="sticky top-1 z-[1] my-4 flex justify-center">
                    <span className="rounded-full bg-bg-muted px-3 py-1 text-[0.75rem] font-semibold text-fg-muted shadow-sm">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                {unreadFirstId.current === m.id && (
                  <div className="my-3 flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-wide text-accent">
                    <span className="h-px flex-1 bg-accent/40" />
                    {unreadCountOnOpen.current} new {unreadCountOnOpen.current === 1 ? 'message' : 'messages'}
                    <span className="h-px flex-1 bg-accent/40" />
                  </div>
                )}
                <Bubble
                  m={m}
                  mine={mine}
                  other={c.other ?? m.sender ?? { username: '', displayName: '', avatarUrl: null }}
                  first={!groupedWithPrev}
                  last={!groupedWithNext}
                  highlighted={highlightId === m.id}
                  status={tickFor(m)}
                  isGroup={isGroup}
                  senderName={senderMember ? firstName(senderMember.displayName) || senderMember.displayName : m.sender?.displayName}
                  senderColor={isGroup && !mine ? memberColor(m.senderId) : undefined}
                  replyName={replyNameFor(m)}
                  onPhoto={setPhoto}
                  onReply={setReplyTo}
                  onReactQuick={(mm) => setActionTarget({ m: mm, mine: mm.senderId === me.id })}
                  onOpenActions={(mm) => setActionTarget({ m: mm, mine: mm.senderId === me.id })}
                  onJumpToReply={jump}
                  registerRef={registerRef}
                />
                {m.failed && (
                  <div className="mt-1 flex justify-end gap-3 pr-1 text-[0.8125rem]">
                    <button onClick={() => retry(m)} className="font-semibold text-accent hover:underline">
                      Retry
                    </button>
                    <button onClick={() => removeMessage(id, m.id)} className="font-semibold text-danger hover:underline">
                      Delete
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })
        )}
        {(anyTyping || anyRecording) && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex h-9 items-center gap-1 rounded-3xl bg-bg-muted px-4" aria-label={isGroup ? (sub?.text ?? 'Someone is typing') : `${c.other?.displayName ?? 'Someone'} is ${anyRecording ? 'recording' : 'typing'}`}>
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showScrollDown && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest messages"
          className="absolute bottom-[76px] right-4 z-20 flex size-11 items-center justify-center rounded-full border border-line bg-card text-fg shadow-lg transition-transform hover:scale-105"
        >
          <ArrowDown className="size-5" />
          {newWhileAway > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[0.6875rem] font-bold text-on-accent">
              {newWhileAway > 99 ? '99+' : newWhileAway}
            </span>
          )}
        </button>
      )}

      {c.canSend ? (
        <Composer conversationId={id} replyTo={replyTo} onClearReply={() => setReplyTo(null)} otherName={isGroup ? (replyTo && memberById.get(replyTo.senderId)?.displayName) || 'them' : c.other?.displayName ?? 'them'} onSend={send} meId={me.id} />
      ) : isGroup && c.left ? (
        <div className="border-t border-line px-4 py-4 text-center text-[0.9375rem] text-fg-muted">
          {leftReason === 'removed' ? 'You were removed from this group' : 'You left this group'}
        </div>
      ) : (
        <div className="border-t border-line px-4 py-4 text-center text-[0.9375rem] text-fg-muted">
          {c.blockedByMe ? `You blocked @${c.other?.username}. Unblock them from their profile to send messages.` : 'You can’t reply to this conversation.'}
        </div>
      )}

      <Lightbox media={photo ? [{ url: photo }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} onIndex={() => {}} />
      {info && (isGroup ? <GroupInfo c={c} onClose={() => setInfo(false)} /> : <ConversationInfo c={c} onClose={() => setInfo(false)} />)}
      <SearchSheet conversationId={id} open={searchOpen} onClose={() => setSearchOpen(false)} onJump={jump} />
      <MessageActionSheet
        target={actionTarget}
        meId={me.id}
        otherSeenAt={c.otherLastReadAt}
        seenByAll={isGroup ? seenByAll : undefined}
        onClose={() => setActionTarget(null)}
        onReact={react}
        onReply={setReplyTo}
        onForward={setForwardMsg}
        onStar={star}
        onEdit={setEditMsg}
        onDeleteForMe={deleteForMe}
        onUnsend={setUnsendMsg}
        onInfo={setInfoMsg}
      />
      <ForwardSheet message={forwardMsg} onClose={() => setForwardMsg(null)} />
      <EditSheet message={editMsg} onClose={() => setEditMsg(null)} />
      <MessageInfoModal
        message={infoMsg}
        mine={infoMsg?.senderId === me.id}
        otherSeenAt={c.otherLastReadAt}
        group={isGroup ? { members, readBy, meId: me.id } : undefined}
        onClose={() => setInfoMsg(null)}
      />
      <ConfirmDialog
        open={!!unsendMsg}
        onOpenChange={(o) => !o && setUnsendMsg(null)}
        title="Unsend message?"
        body="This will remove the message for everyone in the conversation."
        confirmLabel="Unsend"
        onConfirm={() => unsendMsg && unsend(unsendMsg)}
      />
    </div>
  );
}

export function ThreadHeader({ children, onBack }: { children?: React.ReactNode; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-card px-2 pt-[max(0px,env(safe-area-inset-top))]">
      <IconButton label="Back to chats" onClick={onBack}>
        <ArrowLeft className="size-5" />
      </IconButton>
      {children}
    </header>
  );
}
