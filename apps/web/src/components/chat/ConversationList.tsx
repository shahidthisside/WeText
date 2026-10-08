import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, BellOff, Bell, MailOpen, MailPlus, Pin, Search, Star, Users } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useAuthedMe, useCounts } from '../../lib/auth';
import { previewText, readDraft, haptic, convTitle } from '../../lib/chat';
import { usePresence } from '../../lib/realtime';
import { queryClient } from '../../lib/query';
import type { Conversation, UserSummary } from '../../lib/types';
import { cn, shortTime } from '../../lib/utils';
import { Avatar, Button, EmptyState, IconButton, Menu, MenuContent, MenuItem, MenuTrigger, Modal, PageSpinner, Spinner, Tabs, VerifiedLock } from '../ui';
import { GroupAvatar } from './GroupAvatar';
import { NewGroupSheet } from './NewGroup';

type Tab = 'primary' | 'requests' | 'archived';

export function ConversationList({ activeId, onOpenStarred }: { activeId?: string; onOpenStarred: () => void }) {
  const [tab, setTab] = useState<Tab>('primary');
  const [filter, setFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const counts = useCounts();
  const me = useAuthedMe();

  const q = useQuery({
    queryKey: ['conversations', tab],
    queryFn: () => api.get<{ items: Conversation[] }>(`/conversations?tab=${tab}`),
    refetchInterval: 60_000,
    retry: 1,
  });

  const all = q.data?.items ?? [];
  const items = all.filter((c) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    return convTitle(c).toLowerCase().includes(f) || (c.other?.username.toLowerCase().includes(f) ?? false);
  });

  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const onPresence = useCallback((uid: string, online: boolean) => setPresence((p) => (p[uid] === online ? p : { ...p, [uid]: online })), []);
  usePresence(all.map((c) => c.other?.id).filter((x): x is string => !!x), onPresence);

  const firstUnpinnedAfterPin = (() => {
    if (tab !== 'primary') return -1;
    const anyPinned = items.some((c) => c.pinned);
    if (!anyPinned) return -1;
    return items.findIndex((c) => !c.pinned);
  })();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-card pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-[1.5rem] font-extrabold">Chats</h1>
          <div className="flex items-center gap-0.5">
            <IconButton label="Starred messages" onClick={onOpenStarred}>
              <Star className="size-5" />
            </IconButton>
            <IconButton label="New group" onClick={() => setGroupOpen(true)}>
              <Users className="size-5" />
            </IconButton>
            <IconButton label="New chat" onClick={() => setNewOpen(true)}>
              <MailPlus className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="px-4 pb-2">
          <label className="flex h-10 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
            <Search className="size-4 text-fg-muted" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none" />
          </label>
        </div>
        <div className="px-4 pb-3">
          <Tabs
            tabs={[
              { value: 'primary', label: 'Primary' },
              { value: 'requests', label: 'Requests', badge: counts.data?.messageRequests },
              { value: 'archived', label: 'Archived' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isError ? (
          <EmptyState
            title="Couldn’t load your chats"
            body="Something went wrong fetching your conversations. Check your connection and try again."
            action={
              <Button size="lg" onClick={() => q.refetch()} loading={q.isFetching}>
                Try again
              </Button>
            }
          />
        ) : q.isPending ? (
          <PageSpinner />
        ) : !items.length ? (
          filter ? (
            <p className="px-4 py-8 text-center text-fg-muted">No conversations match “{filter}”</p>
          ) : tab === 'requests' ? (
            <EmptyState title="No message requests" body="Messages from people you don’t follow land here. You decide whether to reply." />
          ) : tab === 'archived' ? (
            <EmptyState title="No archived chats" body="Chats you archive are tucked away here, out of your main inbox." icon={<Archive />} />
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
          items.map((c, i) => (
            <div key={c.id}>
              {i === firstUnpinnedAfterPin && firstUnpinnedAfterPin > 0 && (
                <p className="px-5 pb-1 pt-3 text-[0.6875rem] font-bold uppercase tracking-wide text-fg-subtle">All chats</p>
              )}
              {i === 0 && firstUnpinnedAfterPin !== 0 && items[0]!.pinned && (
                <p className="px-5 pb-1 pt-2 text-[0.6875rem] font-bold uppercase tracking-wide text-fg-subtle">Pinned</p>
              )}
              <ConversationRow c={c} active={c.id === activeId} online={(c.other && (presence[c.other.id] ?? c.other.isOnline)) ?? false} meId={me.id} />
            </div>
          ))
        )}
      </div>
      <NewMessageModal open={newOpen} onOpenChange={setNewOpen} onNewGroup={() => setGroupOpen(true)} />
      <NewGroupSheet open={groupOpen} onOpenChange={setGroupOpen} />
    </>
  );
}

function patchConversation(id: string, patch: Partial<Conversation>) {
  queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (d) =>
    d ? { items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d,
  );
}

function ConversationRow({ c, active, online, meId }: { c: Conversation; active: boolean; online: boolean; meId: string }) {
  const draft = typeof window !== 'undefined' ? readDraft(c.id) : '';
  const lm = c.lastMessage;
  const left = !!(c.isGroup && c.left);
  const preview = draft && !left ? draft : previewText(c, meId);
  const unread = (c.unread > 0 || c.markedUnread) && !active && !left;
  const title = convTitle(c);

  const [swipe, setSwipe] = useState(0);
  const start = useRef<number | null>(null);

  async function act(patch: Partial<Conversation>, label: string) {
    const prev = { muted: c.muted, pinned: c.pinned, archived: c.archived, markedUnread: c.markedUnread };
    patchConversation(c.id, patch);
    try {
      await api.patch(`/conversations/${c.id}`, {
        muted: patch.muted,
        pinned: patch.pinned,
        archived: patch.archived,
        markedUnread: patch.markedUnread,
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      if (label) toast(label);
    } catch (e) {
      patchConversation(c.id, prev);
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="relative overflow-hidden border-b border-line">
      {/* swipe reveal (archive) */}
      {swipe < -10 && (
        <div className="absolute inset-y-0 right-0 flex items-center bg-accent px-5 text-on-accent" aria-hidden>
          {c.archived ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
        </div>
      )}
      <div
        className="relative"
        style={{ transform: swipe ? `translateX(${swipe}px)` : undefined, transition: swipe ? 'none' : 'transform 160ms' }}
        onPointerDown={(e) => {
          // Touch-only swipe. Never start a swipe from an interactive control
          // (the options menu button), so clicking/opening the menu can't be
          // misread as a left-swipe and accidentally archive the chat.
          if (e.pointerType !== 'touch') return;
          if ((e.target as HTMLElement).closest('button, [role="menu"], [data-radix-menu-content]')) return;
          start.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (start.current == null) return;
          const dx = e.clientX - start.current;
          if (dx < 0) setSwipe(Math.max(-96, dx));
        }}
        onPointerUp={() => {
          // Require a real horizontal drag past the threshold, not a tap.
          if (swipe < -56) {
            haptic();
            act({ archived: !c.archived }, c.archived ? 'Unarchived' : 'Archived');
          }
          setSwipe(0);
          start.current = null;
        }}
        onPointerCancel={() => {
          setSwipe(0);
          start.current = null;
        }}
      >
        <Link
          to={`/chats/${c.id}`}
          className={cn('relative flex items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-bg-hover', active && 'bg-accent-soft hover:bg-accent-soft', left && 'opacity-70')}
        >
          {c.isGroup ? (
            <GroupAvatar title={c.title} members={c.members} size={52} />
          ) : (
            <Avatar user={c.other} size={52} online={online && c.canSend} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[0.9375rem] leading-5">
              <span className={cn('truncate', unread ? 'font-extrabold' : 'font-bold')}>{title}</span>
              {!c.isGroup && <VerifiedLock show={!!c.other?.isPrivate} />}
              {c.isGroup && <Users className="size-3.5 shrink-0 text-fg-subtle" aria-label="Group" />}
              {c.pinned && <Pin className="size-3 shrink-0 rotate-45 text-fg-subtle" aria-label="Pinned" />}
              {lm && <span className="ml-auto shrink-0 text-[0.75rem] text-fg-muted">{shortTime(lm.createdAt)}</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className={cn('min-w-0 flex-1 truncate text-[0.875rem]', unread ? 'font-semibold text-fg' : 'text-fg-muted')}>
                {draft && !left && <span className="font-semibold text-danger">Draft: </span>}
                {preview}
              </p>
              {(c.muted || left) && <BellOff className="size-3.5 shrink-0 text-fg-muted" aria-label={left ? 'You left' : 'Muted'} />}
              {unread && (c.unread > 0 ? (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[0.6875rem] font-bold text-on-accent" aria-label={`${c.unread} unread`}>
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              ) : (
                <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
              ))}
            </div>
          </div>
          {/* Row menu — reachable by tap and keyboard */}
          <div onClick={(e) => e.preventDefault()}>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label={c.isGroup ? `Options for ${title}` : `Options for chat with ${title}`} className="size-9 text-fg-muted">
                  ⋯
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Pin />} onSelect={() => act({ pinned: !c.pinned }, c.pinned ? 'Unpinned' : 'Pinned')}>
                  {c.pinned ? 'Unpin' : 'Pin'}
                </MenuItem>
                <MenuItem icon={c.muted ? <Bell /> : <BellOff />} onSelect={() => act({ muted: !c.muted }, c.muted ? 'Unmuted' : 'Muted')}>
                  {c.muted ? 'Unmute' : 'Mute'}
                </MenuItem>
                <MenuItem icon={<MailOpen />} onSelect={() => act({ markedUnread: !c.markedUnread }, c.markedUnread ? 'Marked read' : 'Marked unread')}>
                  {c.markedUnread ? 'Mark as read' : 'Mark as unread'}
                </MenuItem>
                <MenuItem icon={c.archived ? <ArchiveRestore /> : <Archive />} onSelect={() => act({ archived: !c.archived }, c.archived ? 'Unarchived' : 'Archived')}>
                  {c.archived ? 'Unarchive' : 'Archive'}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </Link>
      </div>
    </div>
  );
}

export function NewMessageModal({ open, onOpenChange, onNewGroup }: { open: boolean; onOpenChange: (o: boolean) => void; onNewGroup?: () => void }) {
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
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none" />
      </label>
      <div className="min-h-[300px]">
        {onNewGroup && (
          <button
            onClick={() => {
              onOpenChange(false);
              setQ('');
              onNewGroup();
            }}
            className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-bg-hover"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
              <Users className="size-5" />
            </span>
            <span className="font-bold">New group</span>
          </button>
        )}
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
