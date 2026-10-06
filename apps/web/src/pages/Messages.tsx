import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  BellOff,
  Bell,
  ImagePlus,
  Info,
  MailPlus,
  MoreHorizontal,
  Reply,
  Search,
  SendHorizontal,
  SmilePlus,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Lightbox } from '../components/Media';
import { RichText } from '../components/RichText';
import { Avatar, Button, ConfirmDialog, EmptyState, IconButton, Menu, MenuContent, MenuItem, MenuTrigger, Modal, PageSpinner, Spinner, Tabs, VerifiedLock } from '../components/ui';
import { api, errorMessage, uploadImage } from '../lib/api';
import { useAuthedMe, useCounts } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { queryClient } from '../lib/query';
import { usePresence } from '../lib/realtime';
import { getSocket } from '../lib/socket';
import type { Conversation, Message, UserSummary } from '../lib/types';
import { clockTime, cn, dayLabel, lastSeen, shortTime } from '../lib/utils';

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

type MsgPages = { pages: { items: Message[]; hasMore: boolean }[]; pageParams: (number | null)[] };

/* ====================================================================== Page */

export default function Messages() {
  const { id } = useParams();
  return (
    <div
      className={cn(
        'mx-auto mt-4 flex max-w-[1080px] overflow-hidden rounded-[28px] border border-line bg-card shadow-paper',
        id ? 'h-[calc(100dvh-6rem)]' : 'h-[calc(100dvh-10.5rem)]',
      )}
    >
      <section className={cn('flex w-full min-w-0 flex-col border-line md:w-[370px] md:shrink-0 md:border-r', id && 'max-md:hidden')}>
        <ConversationList activeId={id} />
      </section>
      <section className={cn('flex min-w-0 flex-1 flex-col', !id && 'max-md:hidden')}>
        {id ? <Thread key={id} id={id} /> : <NoSelection />}
      </section>
    </div>
  );
}

function NoSelection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        title="Select a message"
        body="Choose from your existing conversations, start a new one, or find someone on Connect."
        action={
          <Button size="lg" onClick={() => setOpen(true)}>
            New chat
          </Button>
        }
      />
      <NewMessageModal open={open} onOpenChange={setOpen} />
    </div>
  );
}

/* ====================================================================== List */

function ConversationList({ activeId }: { activeId?: string }) {
  const [tab, setTab] = useState<'primary' | 'requests'>('primary');
  const [filter, setFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const counts = useCounts();
  const q = useQuery({
    queryKey: ['conversations', tab],
    queryFn: () => api.get<{ items: Conversation[] }>(`/conversations?tab=${tab}`),
    refetchInterval: 60_000,
  });
  const items = (q.data?.items ?? []).filter((c) => {
    const f = filter.trim().toLowerCase();
    return !f || c.other.displayName.toLowerCase().includes(f) || c.other.username.toLowerCase().includes(f);
  });

  // Live presence dots in the list
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const onPresence = useCallback((uid: string, online: boolean) => setPresence((p) => (p[uid] === online ? p : { ...p, [uid]: online })), []);
  usePresence(
    (q.data?.items ?? []).map((c) => c.other.id),
    onPresence,
  );

  return (
    <>
      <header className="sticky top-0 z-10 bg-card">
        <div className="flex h-16 items-center justify-between px-5">
          <h1 className="text-[1.6rem] font-extrabold">Chats</h1>
          <IconButton label="New chat" onClick={() => setNewOpen(true)}>
            <MailPlus className="size-5" />
          </IconButton>
        </div>
        <div className="px-4 pb-2">
          <label className="flex h-11 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
            <Search className="size-4 text-fg-muted" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none" />
          </label>
        </div>
        <div className="border-b border-line px-4 pb-3">
          <Tabs
            tabs={[
              { value: 'primary', label: 'Primary' },
              { value: 'requests', label: 'Requests', badge: counts.data?.messageRequests },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isPending ? (
          <PageSpinner />
        ) : !items.length ? (
          filter ? (
            <p className="px-4 py-8 text-center text-fg-muted">No conversations match “{filter}”</p>
          ) : tab === 'requests' ? (
            <EmptyState title="No message requests" body="Messages from people you don’t follow land here. You decide whether to reply." />
          ) : (
            <EmptyState
              title="Welcome to your inbox!"
              body="Drop a line, share posts and more with private conversations."
              action={
                <Button size="lg" onClick={() => setNewOpen(true)}>
                  Write a message
                </Button>
              }
            />
          )
        ) : (
          items.map((c) => <ConversationRow key={c.id} c={c} active={c.id === activeId} online={presence[c.other.id] ?? c.other.isOnline} />)
        )}
      </div>
      <NewMessageModal open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}

function ConversationRow({ c, active, online }: { c: Conversation; active: boolean; online: boolean }) {
  const me = useAuthedMe();
  const lm = c.lastMessage;
  const preview = !lm
    ? 'Say hi 👋'
    : lm.deleted
      ? 'Message unsent'
      : `${lm.senderId === me.id ? 'You: ' : ''}${lm.body || (lm.image ? 'Sent a photo' : '')}`;
  const unread = c.unread > 0 && !active;
  return (
    <Link
      to={`/chats/${c.id}`}
      className={cn('relative mx-2 my-0.5 flex gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-bg-hover', active && 'bg-accent-soft hover:bg-accent-soft')}
    >
      <Avatar user={c.other} size={48} online={online && c.canSend} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[0.9375rem] leading-5">
          <span className="truncate font-bold">{c.other.displayName}</span>
          <VerifiedLock show={c.other.isPrivate} />
          <span className="truncate text-fg-muted">@{c.other.username}</span>
          {lm && <span className="shrink-0 text-fg-muted">· {shortTime(lm.createdAt)}</span>}
          {c.muted && <BellOff className="ml-auto size-3.5 shrink-0 text-fg-muted" aria-label="Muted" />}
        </div>
        <div className="flex items-center gap-2">
          <p className={cn('min-w-0 flex-1 truncate text-[0.9375rem]', unread ? 'font-semibold text-fg' : 'text-fg-muted')}>{preview}</p>
          {unread && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label={`${c.unread} unread`} />}
        </div>
      </div>
    </Link>
  );
}

function NewMessageModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const res = useQuery({
    queryKey: ['dm-search', q],
    queryFn: () => api.get<{ users: UserSummary[] }>(`/search?q=${encodeURIComponent(q)}&type=people`),
    enabled: q.trim().length > 0,
  });
  async function start(u: UserSummary) {
    setBusy(u.id);
    try {
      const r = await api.post<{ conversation: Conversation }>('/conversations', { username: u.username });
      onOpenChange(false);
      setQ('');
      navigate(`/chats/${r.conversation.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New chat">
      <label className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Search className="size-5 text-accent" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none" />
      </label>
      <div className="min-h-[300px]">
        {res.isFetching && <PageSpinner />}
        {res.data?.users.map((u) => (
          <button key={u.id} onClick={() => start(u)} disabled={!!busy} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover">
            <Avatar user={u} size={40} />
            <span className="min-w-0 flex-1 leading-5">
              <span className="block truncate font-bold">{u.displayName}</span>
              <span className="block truncate text-fg-muted">@{u.username}</span>
            </span>
            {busy === u.id && <Spinner className="size-4" />}
          </button>
        ))}
        {res.data && !res.data.users.length && <p className="px-4 py-8 text-center text-fg-muted">No people found</p>}
      </div>
    </Modal>
  );
}

/* ====================================================================== Thread */

function Thread({ id }: { id: string }) {
  const me = useAuthedMe();
  const navigate = useNavigate();
  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api.get<{ conversation: Conversation }>(`/conversations/${id}`), retry: false });
  const msgs = useInfiniteQuery({
    queryKey: ['messages', id],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => api.get<{ items: Message[]; hasMore: boolean }>(`/conversations/${id}/messages${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => (last.hasMore && last.items[0] ? last.items[0].createdAt : undefined),
    staleTime: Infinity,
  });
  const c = conv.data?.conversation;

  // Presence + typing
  const [online, setOnline] = useState<boolean | null>(null);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const onPresence = useCallback((_u: string, o: boolean, ls: number | null) => {
    setOnline(o);
    setSeenAt(ls);
  }, []);
  usePresence(c ? [c.other.id] : [], onPresence);
  useEffect(() => {
    const s = getSocket();
    let t: ReturnType<typeof setTimeout>;
    const onTyping = (p: { conversationId: string }) => {
      if (p.conversationId !== id) return;
      setTyping(true);
      clearTimeout(t);
      t = setTimeout(() => setTyping(false), 3500);
    };
    const onNew = (p: { conversationId: string; message: Message }) => {
      if (p.conversationId === id && p.message.senderId !== me.id) setTyping(false);
    };
    s.on('typing', onTyping);
    s.on('message:new', onNew);
    return () => {
      s.off('typing', onTyping);
      s.off('message:new', onNew);
      clearTimeout(t);
    };
  }, [id, me.id]);

  // Flatten oldest -> newest
  const messages = useMemo(() => (msgs.data ? [...msgs.data.pages].reverse().flatMap((p) => p.items) : []), [msgs.data]);
  const lastIncoming = [...messages].reverse().find((m) => m.senderId !== me.id)?.createdAt ?? 0;

  // Mark read when new incoming messages arrive while viewing.
  useEffect(() => {
    if (!c || !lastIncoming) return;
    const mark = () => {
      if (document.visibilityState !== 'visible') return;
      api.post(`/conversations/${id}/read`).catch(() => {});
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (d) => (d ? { items: d.items.map((x) => (x.id === id ? { ...x, unread: 0 } : x)) } : d));
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [id, lastIncoming, !!c]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll management: stick to bottom unless the user scrolled up.
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef(0);
  const loadingOlder = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      loadingOlder.current = false;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, typing]);

  const onScroll = () => {
    const el = scroller.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 200 && msgs.hasNextPage && !msgs.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      loadingOlder.current = true;
      msgs.fetchNextPage();
    }
  };

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [info, setInfo] = useState(false);

  if (conv.isError) {
    return (
      <div className="flex flex-1 flex-col">
        <ThreadHeader onBack={() => navigate('/chats')} />
        <EmptyState title="Conversation not found" body="It may have been deleted, or you don’t have access." />
      </div>
    );
  }
  if (!c) return <PageSpinner />;

  const isOnline = online ?? c.other.isOnline;
  const status = !c.canSend ? null : typing ? 'typing…' : isOnline ? 'Online' : lastSeen(seenAt ?? c.other.lastSeenAt);
  const lastMine = [...messages].reverse().find((m) => m.senderId === me.id && !m.pending);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ThreadHeader onBack={() => navigate('/chats')}>
        <Link to={`/${c.other.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar user={c.other} size={40} online={isOnline && c.canSend} />
          <span className="min-w-0 leading-5">
            <span className="flex items-center gap-1 font-display font-bold">
              <span className="truncate">{c.other.displayName}</span>
              <VerifiedLock show={c.other.isPrivate} />
            </span>
            <span className={cn('block truncate text-[0.8125rem]', typing ? 'text-accent' : 'text-fg-muted')}>{status ?? `@${c.other.username}`}</span>
          </span>
        </Link>
        <IconButton label="Conversation info" onClick={() => setInfo(true)}>
          <Info className="size-5" />
        </IconButton>
      </ThreadHeader>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {msgs.isFetchingNextPage && (
          <div className="flex justify-center py-2 text-accent">
            <Spinner />
          </div>
        )}
        {!msgs.hasNextPage && !msgs.isPending && (
          <Link to={`/${c.other.username}`} className="mb-6 flex flex-col items-center border-b border-line px-4 pb-8 pt-4 text-center hover:bg-bg-hover/40">
            <Avatar user={c.other} size={64} />
            <p className="mt-2 font-bold">{c.other.displayName}</p>
            <p className="text-[0.9375rem] text-fg-muted">@{c.other.username}</p>
            {c.isRequest && <p className="mt-3 max-w-[320px] text-[0.875rem] text-fg-muted">You don’t follow @{c.other.username}. Reply to accept this request, or block them from the menu.</p>}
          </Link>
        )}
        {msgs.isPending ? (
          <PageSpinner />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const groupedWithPrev = !!prev && !newDay && prev.senderId === m.senderId && m.createdAt - prev.createdAt < 5 * 60_000;
            const groupedWithNext = !!next && next.senderId === m.senderId && next.createdAt - m.createdAt < 5 * 60_000 && new Date(next.createdAt).toDateString() === new Date(m.createdAt).toDateString();
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-4 text-center text-[0.8125rem] font-semibold text-fg-muted">
                    <span>{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <Bubble
                  m={m}
                  mine={m.senderId === me.id}
                  other={c.other}
                  first={!groupedWithPrev}
                  last={!groupedWithNext}
                  onReply={() => setReplyTo(m)}
                  onPhoto={setPhoto}
                  meId={me.id}
                  conversationId={id}
                />
                {lastMine?.id === m.id && !groupedWithNext && (
                  <p className="mt-1 text-right text-[0.75rem] text-fg-muted">{c.otherLastReadAt >= m.createdAt ? 'Seen' : 'Sent'}</p>
                )}
              </Fragment>
            );
          })
        )}
        {typing && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex h-9 items-center gap-1 rounded-3xl bg-bg-muted px-4" aria-label={`${c.other.displayName} is typing`}>
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {c.canSend ? (
        <MessageInput conversationId={id} replyTo={replyTo} onClearReply={() => setReplyTo(null)} otherName={c.other.displayName} onSent={() => (atBottom.current = true)} />
      ) : (
        <div className="border-t border-line px-4 py-4 text-center text-[0.9375rem] text-fg-muted">
          {c.blockedByMe ? `You blocked @${c.other.username}. Unblock them from their profile to send messages.` : 'You can’t reply to this conversation.'}
        </div>
      )}
      <Lightbox media={photo ? [{ url: photo }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} onIndex={() => {}} />
      {info && <ConversationInfo c={c} onClose={() => setInfo(false)} />}
    </div>
  );
}

function ThreadHeader({ children, onBack }: { children?: React.ReactNode; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-card px-3">
      <IconButton label="Back" className="md:hidden" onClick={onBack}>
        <ArrowLeft className="size-5" />
      </IconButton>
      {children}
    </header>
  );
}

/* ====================================================================== Bubble */

function Bubble({
  m,
  mine,
  other,
  first,
  last,
  onReply,
  onPhoto,
  meId,
  conversationId,
}: {
  m: Message;
  mine: boolean;
  other: UserSummary;
  first: boolean;
  last: boolean;
  onReply: () => void;
  onPhoto: (url: string) => void;
  meId: string;
  conversationId: string;
}) {
  const [picker, setPicker] = useState(false);
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const myReaction = m.reactions.find((r) => r.userIds.includes(meId))?.emoji ?? null;

  async function react(emoji: string | null) {
    setPicker(false);
    try {
      const r = await api.put<{ message: Message }>(`/messages/${m.id}/reaction`, { emoji });
      replaceMessage(conversationId, r.message);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function unsend() {
    try {
      const r = await api.del<{ message: Message }>(`/messages/${m.id}`);
      replaceMessage(conversationId, r.message);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConfirmUnsend(false);
    }
  }

  const radius = mine
    ? cn('rounded-3xl', !first && 'rounded-tr-md', !last && 'rounded-br-md')
    : cn('rounded-3xl', !first && 'rounded-tl-md', !last && 'rounded-bl-md');

  return (
    <div className={cn('group flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row', first ? 'mt-3' : 'mt-0.5', m.reactions.length > 0 && 'mb-4')}>
      {!mine && <div className="w-8 shrink-0">{last && <Avatar user={other} size={32} />}</div>}
      <div className={cn('flex max-w-[75%] flex-col', mine ? 'items-end' : 'items-start')}>
        {m.replyTo && !m.deleted && (
          <div className={cn('mb-[-8px] max-w-full truncate rounded-2xl bg-bg-muted/70 px-3 pb-3 pt-1.5 text-[0.8125rem] text-fg-muted')}>
            <Reply className="mr-1 inline size-3" />
            {m.replyTo.deleted ? 'Original message was unsent' : m.replyTo.body || (m.replyTo.hasImage ? 'Photo' : '')}
          </div>
        )}
        <div className="relative">
          {m.deleted ? (
            <div className={cn('border border-line px-4 py-2 text-[0.9375rem] italic text-fg-muted', radius)}>{mine ? 'You unsent a message' : 'Message unsent'}</div>
          ) : (
            <div className={cn('overflow-hidden', radius, m.pending && 'opacity-60', m.failed && 'ring-2 ring-danger')}>
              {m.image && (
                <button onClick={() => onPhoto(m.image!.url)} className="block" aria-label="Open photo">
                  <img
                    src={m.image.url}
                    alt=""
                    className="max-h-[320px] w-full max-w-[320px] bg-bg-muted object-cover"
                    style={{ aspectRatio: m.image.width && m.image.height ? `${m.image.width}/${m.image.height}` : undefined }}
                  />
                </button>
              )}
              {m.body && (
                <div className={cn('px-4 py-2 text-[0.9375rem] leading-snug', mine ? 'bg-accent text-on-accent [&_a]:text-on-accent [&_a]:underline' : 'bg-bg-muted text-fg')}>
                  <RichText text={m.body} />
                </div>
              )}
            </div>
          )}
          {m.reactions.length > 0 && (
            <button
              onClick={() => react(myReaction ? null : m.reactions[0]!.emoji)}
              className={cn('absolute -bottom-4 flex items-center gap-0.5 rounded-full border border-line bg-bg px-1.5 py-0.5 text-[0.8125rem] shadow-sm', mine ? 'right-2' : 'left-2')}
              aria-label="Reactions"
            >
              {m.reactions.map((r) => (
                <span key={r.emoji}>{r.emoji}</span>
              ))}
              {m.reactions.reduce((s, r) => s + r.userIds.length, 0) > 1 && <span className="pl-0.5 text-fg-muted">{m.reactions.reduce((s, r) => s + r.userIds.length, 0)}</span>}
            </button>
          )}
        </div>
        {m.failed && <p className="mt-1 text-[0.75rem] text-danger">Failed to send</p>}
      </div>

      {/* Hover actions */}
      {!m.deleted && !m.pending && (
        <div className={cn('relative mb-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100', picker && 'opacity-100')}>
          <IconButton label="React" className="size-8 text-fg-muted" onClick={() => setPicker((p) => !p)}>
            <SmilePlus className="size-4" />
          </IconButton>
          <IconButton label="Reply" className="size-8 text-fg-muted" onClick={onReply}>
            <Reply className="size-4" />
          </IconButton>
          {mine && (
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More" className="size-8 text-fg-muted">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <div className="px-4 py-1.5 text-[0.75rem] text-fg-muted">{clockTime(m.createdAt)}</div>
                <MenuItem icon={<Undo2 />} danger onSelect={() => setConfirmUnsend(true)}>
                  Unsend
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
          {picker && (
            <div className={cn('absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-line bg-bg-elev p-1 shadow-lg animate-fade-in', mine ? 'right-0' : 'left-0')}>
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => react(myReaction === e ? null : e)}
                  className={cn('flex size-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125', myReaction === e && 'bg-accent-soft')}
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmUnsend}
        onOpenChange={setConfirmUnsend}
        title="Unsend message?"
        body="This will remove the message for everyone in the conversation."
        confirmLabel="Unsend"
        onConfirm={unsend}
      />
    </div>
  );
}

function replaceMessage(conversationId: string, msg: Message, matchId = msg.id) {
  queryClient.setQueryData<MsgPages>(['messages', conversationId], (d) =>
    d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === matchId ? msg : x)) })) } : d,
  );
}

/* ====================================================================== Input */

function MessageInput({
  conversationId,
  replyTo,
  onClearReply,
  otherName,
  onSent,
}: {
  conversationId: string;
  replyTo: Message | null;
  onClearReply: () => void;
  otherName: string;
  onSent: () => void;
}) {
  const me = useAuthedMe();
  const prefs = usePrefs();
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ preview: string; uploaded?: { url: string; width: number; height: number } } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    ta.current?.focus();
  }, [conversationId, replyTo]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  async function pickImage(f: File) {
    const preview = URL.createObjectURL(f);
    setImage({ preview });
    try {
      const up = await uploadImage(f, 'media');
      setImage({ preview, uploaded: up });
    } catch (e) {
      toast.error(errorMessage(e));
      setImage(null);
    }
  }

  async function send() {
    const body = text.trim();
    if ((!body && !image?.uploaded) || (image && !image.uploaded)) return;
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId,
      senderId: me.id,
      body,
      image: image?.uploaded ?? null,
      replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, body: replyTo.body.slice(0, 140), hasImage: !!replyTo.image, deleted: false } : null,
      createdAt: Date.now(),
      deleted: false,
      reactions: [],
      pending: true,
    };
    queryClient.setQueryData<MsgPages>(['messages', conversationId], (d) => {
      if (!d) return d;
      const pages = [...d.pages];
      pages[0] = { ...pages[0]!, items: [...pages[0]!.items, optimistic] };
      return { ...d, pages };
    });
    onSent();
    setText('');
    setImage(null);
    onClearReply();
    try {
      const r = await api.post<{ message: Message }>(`/conversations/${conversationId}/messages`, {
        body,
        image: optimistic.image,
        replyToId: optimistic.replyTo?.id,
      });
      // The socket echo may have already inserted the real message; drop the temp one in that case.
      queryClient.setQueryData<MsgPages>(['messages', conversationId], (d) => {
        if (!d) return d;
        const exists = d.pages.some((p) => p.items.some((x) => x.id === r.message.id));
        return {
          ...d,
          pages: d.pages.map((p) => ({ ...p, items: exists ? p.items.filter((x) => x.id !== tempId) : p.items.map((x) => (x.id === tempId ? r.message : x)) })),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      replaceMessage(conversationId, { ...optimistic, pending: false, failed: true }, tempId);
      toast.error(errorMessage(e));
    }
  }

  function onChange(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2000) {
      lastTyping.current = now;
      getSocket().emit('typing', { conversationId });
    }
  }

  return (
    <div className="shrink-0 border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4">
      {replyTo && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-bg-muted px-3 py-2 text-[0.875rem]">
          <Reply className="size-4 shrink-0 text-fg-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Replying to {replyTo.senderId === me.id ? 'yourself' : otherName}</p>
            <p className="truncate text-fg-muted">{replyTo.body || 'Photo'}</p>
          </div>
          <IconButton label="Cancel reply" className="size-7" onClick={onClearReply}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}
      {image && (
        <div className="relative mb-2 w-fit">
          <img src={image.preview} alt="" className="max-h-32 rounded-xl" />
          {!image.uploaded && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 text-white">
              <Spinner />
            </div>
          )}
          <button onClick={() => setImage(null)} aria-label="Remove image" className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1 rounded-[26px] bg-bg-muted px-2 py-1 transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickImage(f);
            e.target.value = '';
          }}
        />
        <IconButton label="Add photo" tone="accent" disabled={!!image} onClick={() => file.current?.click()}>
          <ImagePlus className="size-5" />
        </IconButton>
        <textarea
          ref={ta}
          value={text}
          rows={1}
          maxLength={2000}
          aria-label="Message"
          placeholder="Start a new message"
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const f = e.clipboardData.files[0];
            if (f?.type.startsWith('image/')) {
              e.preventDefault();
              pickImage(f);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (prefs.sendOnEnter || e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
            if (e.key === 'Escape' && replyTo) onClearReply();
          }}
          className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-[7px] text-[0.9375rem] leading-[1.375rem] outline-none placeholder:text-fg-muted"
        />
        <IconButton label="Send" tone="accent" onClick={send} disabled={(!text.trim() && !image?.uploaded) || (!!image && !image.uploaded)}>
          <SendHorizontal className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}

/* ====================================================================== Info */

function ConversationInfo({ c, onClose }: { c: Conversation; onClose: () => void }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);
  async function toggleMute() {
    try {
      const r = await api.patch<{ conversation: Conversation }>(`/conversations/${c.id}`, { muted: !c.muted });
      queryClient.setQueryData(['conversation', c.id], { conversation: r.conversation });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      toast(r.conversation.muted ? 'Conversation muted' : 'Conversation unmuted');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove() {
    await api.del(`/conversations/${c.id}`);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.removeQueries({ queryKey: ['messages', c.id] });
    navigate('/chats');
    toast('Conversation deleted');
  }
  async function block() {
    await api.post(`/users/${c.other.username}/block`);
    queryClient.invalidateQueries({ queryKey: ['conversation', c.id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    onClose();
    toast(`Blocked @${c.other.username}`);
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Conversation info">
      <Link to={`/${c.other.username}`} className="flex items-center gap-3 border-b border-line px-4 py-4 hover:bg-bg-hover">
        <Avatar user={c.other} size={48} />
        <span className="leading-5">
          <span className="block font-bold">{c.other.displayName}</span>
          <span className="block text-fg-muted">@{c.other.username}</span>
        </span>
      </Link>
      <button onClick={toggleMute} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-bg-hover">
        {c.muted ? <Bell className="size-5" /> : <BellOff className="size-5" />}
        <span>{c.muted ? 'Unmute conversation' : 'Mute conversation'}</span>
      </button>
      {!c.blockedByMe && (
        <button onClick={() => setConfirm('block')} className="flex w-full items-center gap-3 px-4 py-4 text-left text-danger hover:bg-bg-hover">
          <Ban className="size-5" /> Block @{c.other.username}
        </button>
      )}
      <button onClick={() => setConfirm('delete')} className="flex w-full items-center gap-3 px-4 py-4 text-left text-danger hover:bg-bg-hover">
        <Trash2 className="size-5" /> Delete conversation
      </button>
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete conversation?"
        body="This conversation will be deleted from your inbox. Other people in the conversation will still be able to see it."
        confirmLabel="Delete"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={confirm === 'block'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Block @${c.other.username}?`}
        body="They won’t be able to message you, follow you, or see your posts."
        confirmLabel="Block"
        onConfirm={block}
      />
    </Modal>
  );
}
