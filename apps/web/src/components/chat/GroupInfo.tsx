import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, Check, Hourglass, LogOut, Pencil, Pin, PinOff, Shield, ShieldOff, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useAuthedMe } from '../../lib/auth';
import { TTL_OPTIONS } from '../../lib/chat';
import { markSelfLeft } from '../../lib/chat';
import { queryClient } from '../../lib/query';
import type { Conversation, GroupMember, Message } from '../../lib/types';
import { Avatar, ConfirmDialog, IconButton, Spinner } from '../ui';
import { GroupAvatar } from './GroupAvatar';
import { AddPeopleSheet } from './AddPeople';
import { AudioBubble } from './AudioBubble';
import { Lightbox } from '../Media';
import { Sheet, SheetAction } from './sheet';

/** Group info: title, members, admin actions, add people, leave, media. */
export function GroupInfo({ c, onClose }: { c: Conversation; onClose: () => void }) {
  const me = useAuthedMe();
  const navigate = useNavigate();
  const isAdmin = c.myRole === 'admin' && !c.left;
  const members = c.members ?? [];
  const activeAdmins = members.filter((m) => m.role === 'admin');
  const soleAdmin = isAdmin && activeAdmins.length === 1;

  const [tab, setTab] = useState<'about' | 'media' | 'audio'>('about');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title ?? '');
  const [savingTitle, setSavingTitle] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'leave' } | { kind: 'remove'; member: GroupMember } | { kind: 'delete' }>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  async function patch(body: Record<string, unknown>, label?: string) {
    try {
      const r = await api.patch<{ conversation: Conversation }>(`/conversations/${c.id}`, body);
      queryClient.setQueryData(['conversation', c.id], { conversation: r.conversation });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      if (label) toast(label);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function saveTitle() {
    const t = title.trim();
    if (!t || t === c.title) {
      setEditing(false);
      setTitle(c.title ?? '');
      return;
    }
    setSavingTitle(true);
    try {
      const r = await api.patch<{ conversation: Conversation }>(`/conversations/${c.id}`, { title: t });
      queryClient.setQueryData(['conversation', c.id], { conversation: r.conversation });
      queryClient.setQueriesData<{ items: Conversation[] }>({ queryKey: ['conversations'] }, (d) =>
        d ? { items: d.items.map((x) => (x.id === c.id ? { ...x, title: r.conversation.title, members: r.conversation.members } : x)) } : d,
      );
      // Keep focus inside the dialog before the input unmounts, so Radix's modal
      // focus guard doesn't treat the removed node as an outside interaction and close.
      headerRef.current?.focus();
      setEditing(false);
      toast('Group renamed');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingTitle(false);
    }
  }

  async function setRole(member: GroupMember, role: 'admin' | 'member') {
    try {
      const r = await api.patch<{ conversation: Conversation }>(`/conversations/${c.id}/members/${member.id}`, { role });
      queryClient.setQueryData(['conversation', c.id], { conversation: r.conversation });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast(role === 'admin' ? `${member.displayName} is now an admin` : `${member.displayName} is no longer an admin`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function removeMember(member: GroupMember) {
    setConfirm(null);
    try {
      const r = await api.del<{ conversation: Conversation }>(`/conversations/${c.id}/members/${member.id}`);
      if (r?.conversation) queryClient.setQueryData(['conversation', c.id], { conversation: r.conversation });
      queryClient.invalidateQueries({ queryKey: ['conversation', c.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast(`Removed ${member.displayName}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function leave() {
    setConfirm(null);
    try {
      markSelfLeft(c.id);
      await api.del(`/conversations/${c.id}/members/${me.id}`);
      queryClient.invalidateQueries({ queryKey: ['conversation', c.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      toast('You left the group');
      onClose();
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

  const media = useQuery({
    queryKey: ['conv-media', c.id, tab],
    queryFn: () => api.get<{ items: Message[] }>(`/conversations/${c.id}/media?kind=${tab === 'media' ? 'image' : 'audio'}`),
    enabled: tab === 'media' || tab === 'audio',
  });

  const memberOnly = !isAdmin && !c.left;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Group info">
      <div ref={headerRef} tabIndex={-1} className="flex flex-col items-center px-4 pb-2 pt-1 text-center outline-none">
        <GroupAvatar title={c.title} members={members} size={72} />
        {editing ? (
          <div className="mt-2 flex w-full max-w-[280px] items-center gap-1">
            <input
              autoFocus
              value={title}
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') { setEditing(false); setTitle(c.title ?? ''); }
              }}
              aria-label="Group name"
              className="h-10 min-w-0 flex-1 rounded-xl bg-bg-muted px-3 text-center font-display text-[1.0625rem] font-bold outline-none focus:ring-2 focus:ring-accent"
            />
            <IconButton label="Save name" onClick={saveTitle} disabled={savingTitle}>
              {savingTitle ? <Spinner className="size-4" /> : <Check className="size-5 text-accent" />}
            </IconButton>
            <IconButton label="Cancel" onClick={() => { setEditing(false); setTitle(c.title ?? ''); }}>
              <X className="size-5" />
            </IconButton>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => isAdmin && setEditing(true)}
            disabled={!isAdmin}
            className="mt-2 flex items-center gap-1.5 font-display text-[1.125rem] font-bold disabled:cursor-default"
          >
            {c.title}
            {isAdmin && <Pencil className="size-4 text-fg-muted" aria-label="Edit name" />}
          </button>
        )}
        <p className="text-[0.875rem] text-fg-muted">{c.memberCount ?? members.length} members</p>
      </div>

      <div className="mx-4 mb-2 flex rounded-full border border-line bg-card p-1 text-[0.8125rem] font-semibold">
        {(['about', 'media', 'audio'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded-full py-1.5 capitalize transition-colors ${tab === t ? 'bg-fg text-bg' : 'text-fg-muted'}`}
          >
            {t === 'audio' ? 'Voice' : t}
          </button>
        ))}
      </div>

      {tab === 'about' && (
        <div className="pb-2">
          {/* Disappearing messages (admins only) */}
          <div className="px-4 py-2">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wide text-fg-subtle">
              <Hourglass className="size-4" /> Disappearing messages
            </p>
            <div className="mt-2 flex gap-2">
              {TTL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => patch({ ttlSeconds: o.value }, o.value ? `Messages disappear after ${o.label}` : 'Disappearing messages off')}
                  aria-pressed={c.ttlSeconds === o.value}
                  className={`flex-1 rounded-xl border px-2 py-2 text-[0.8125rem] font-semibold transition-colors disabled:opacity-50 ${
                    c.ttlSeconds === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-muted hover:bg-bg-hover'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {memberOnly && <p className="mt-1 text-[0.75rem] text-fg-subtle">Only admins can change this.</p>}
          </div>

          <div className="h-px bg-line" />

          {/* Per-user settings (work for every member) */}
          <SheetAction icon={c.muted ? <Bell /> : <BellOff />} onClick={() => patch({ muted: !c.muted }, c.muted ? 'Group unmuted' : 'Group muted')}>
            {c.muted ? 'Unmute group' : 'Mute group'}
          </SheetAction>
          <SheetAction icon={c.pinned ? <PinOff /> : <Pin />} onClick={() => patch({ pinned: !c.pinned }, c.pinned ? 'Unpinned' : 'Pinned')}>
            {c.pinned ? 'Unpin group' : 'Pin group'}
          </SheetAction>

          <div className="h-px bg-line" />

          {/* Members */}
          <div className="flex items-center justify-between px-5 pb-1 pt-3">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wide text-fg-subtle">
              <Users className="size-4" /> {members.length} members
            </p>
            {isAdmin && (
              <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1 text-[0.8125rem] font-semibold text-accent">
                <UserPlus className="size-4" /> Add people
              </button>
            )}
          </div>
          <ul>
            {members.map((m) => (
              <li key={m.id} className="flex flex-col px-5 py-2">
                <div className="flex items-center gap-3">
                  <Avatar user={m} size={40} online={m.isOnline} />
                  <span className="min-w-0 flex-1 leading-5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-bold">{m.id === me.id ? 'You' : m.displayName}</span>
                      {m.role === 'admin' && (
                        <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-accent">Admin</span>
                      )}
                    </span>
                    <span className="block truncate text-[0.8125rem] text-fg-muted">@{m.username}</span>
                  </span>
                  {isAdmin && m.id !== me.id && (
                    <IconButton
                      label={`Manage ${m.displayName}`}
                      className="size-9 text-fg-muted"
                      onClick={() => setOpenMenuFor((v) => (v === m.id ? null : m.id))}
                    >
                      ⋯
                    </IconButton>
                  )}
                </div>
                {isAdmin && m.id !== me.id && openMenuFor === m.id && (
                  <div className="mt-1 flex flex-col gap-0.5 rounded-xl bg-bg-muted p-1" role="menu">
                    {m.role === 'admin' ? (
                      <button type="button" role="menuitem" onClick={() => { setOpenMenuFor(null); setRole(m, 'member'); }} className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-left text-[0.9375rem] hover:bg-bg-hover">
                        <ShieldOff className="size-4 text-fg-muted" /> Remove admin
                      </button>
                    ) : (
                      <button type="button" role="menuitem" onClick={() => { setOpenMenuFor(null); setRole(m, 'admin'); }} className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-left text-[0.9375rem] hover:bg-bg-hover">
                        <Shield className="size-4 text-fg-muted" /> Make admin
                      </button>
                    )}
                    <button type="button" role="menuitem" onClick={() => { setOpenMenuFor(null); setConfirm({ kind: 'remove', member: m }); }} className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-left text-[0.9375rem] text-danger hover:bg-bg-hover">
                      <UserMinus className="size-4" /> Remove from group
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="h-px bg-line" />
          {!c.left && (
            <SheetAction icon={<LogOut />} danger onClick={() => setConfirm({ kind: 'leave' })}>
              Leave group
            </SheetAction>
          )}
          <SheetAction icon={<Trash2 />} danger onClick={() => setConfirm({ kind: 'delete' })}>
            Delete conversation
          </SheetAction>
        </div>
      )}

      {tab === 'media' && (
        <div className="min-h-[160px] px-3 pb-4">
          {media.isPending ? (
            <div className="flex justify-center py-8 text-accent"><Spinner /></div>
          ) : !media.data?.items.length ? (
            <p className="py-8 text-center text-fg-muted">No photos yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {media.data.items.map((m) => m.image && (
                <button key={m.id} type="button" onClick={() => setPhoto(m.image!.url)} className="aspect-square overflow-hidden rounded-lg" aria-label="Open photo">
                  <img src={m.image.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'audio' && (
        <div className="min-h-[160px] px-3 pb-4">
          {media.isPending ? (
            <div className="flex justify-center py-8 text-accent"><Spinner /></div>
          ) : !media.data?.items.length ? (
            <p className="py-8 text-center text-fg-muted">No voice messages yet</p>
          ) : (
            <div className="flex flex-col gap-1">
              {media.data.items.map((m) => m.audio && (
                <div key={m.id} className="rounded-2xl bg-bg-muted"><AudioBubble url={m.audio.url} durationMs={m.audio.durationMs} mine={false} seed={m.id} /></div>
              ))}
            </div>
          )}
        </div>
      )}

      <Lightbox media={photo ? [{ url: photo }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} onIndex={() => {}} />

      <AddPeopleSheet conversationId={c.id} excludeIds={members.map((m) => m.id)} open={addOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDialog
        open={confirm?.kind === 'leave'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Leave this group?"
        body={soleAdmin
          ? 'You’re the only admin. When you leave, the longest-standing member will become an admin. You’ll keep the chat history up to now, but can’t send new messages.'
          : 'You’ll keep the chat history up to now, but can’t send new messages unless someone adds you back.'}
        confirmLabel="Leave"
        onConfirm={leave}
      />
      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'remove' ? `Remove ${confirm.member.displayName}?` : 'Remove member?'}
        body="They won’t be able to send new messages, but will keep the history up to now."
        confirmLabel="Remove"
        onConfirm={() => confirm?.kind === 'remove' && removeMember(confirm.member)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete conversation?"
        body="This group will be removed from your inbox. Other members still keep it."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </Sheet>
  );
}
