import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useAuthedMe } from '../../lib/auth';
import { queryClient } from '../../lib/query';
import type { Conversation, UserCard, UserSummary } from '../../lib/types';
import { Avatar, Button, IconButton, Spinner } from '../ui';
import { Sheet } from './sheet';

const MAX_GROUP = 50;
const MAX_PICK = MAX_GROUP - 1; // 49 others + me

type Candidate = Pick<UserSummary, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isPrivate'>;

/**
 * The "New group" flow. Step 1 picks 2–49 people from the accounts the viewer
 * follows or who follow them (searchable). Step 2 names the group. On create it
 * opens the new conversation.
 */
export function NewGroupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useAuthedMe();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep(1);
    setFilter('');
    setPicked([]);
    setTitle('');
    setBusy(false);
  }

  // People you follow + people who follow you (either direction passes most DM policies).
  const following = useQuery({
    queryKey: ['followList', me.username, 'following'],
    queryFn: () => api.get<{ users: UserCard[] }>(`/users/${me.username}/following`),
    enabled: open,
  });
  const followers = useQuery({
    queryKey: ['followList', me.username, 'followers'],
    queryFn: () => api.get<{ users: UserCard[] }>(`/users/${me.username}/followers`),
    enabled: open,
  });
  // Optional search to reach people not on the first page of either list.
  const search = useQuery({
    queryKey: ['dm-search', filter],
    queryFn: () => api.get<{ users: UserCard[] }>(`/search?q=${encodeURIComponent(filter)}&type=people`),
    enabled: open && filter.trim().length > 0,
  });

  const candidates = useMemo(() => {
    const map = new Map<string, Candidate>();
    const add = (u: UserCard | UserSummary) => {
      if (u.id === me.id) return;
      if (!map.has(u.id)) map.set(u.id, { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, isPrivate: u.isPrivate });
    };
    for (const u of following.data?.users ?? []) add(u);
    for (const u of followers.data?.users ?? []) add(u);
    const f = filter.trim().toLowerCase();
    if (f) for (const u of search.data?.users ?? []) add(u);
    let list = [...map.values()];
    if (f) list = list.filter((u) => u.displayName.toLowerCase().includes(f) || u.username.toLowerCase().includes(f));
    return list;
  }, [following.data, followers.data, search.data, filter, me.id]);

  const pickedIds = new Set(picked.map((p) => p.id));
  const loading = following.isPending || followers.isPending;

  function toggle(u: Candidate) {
    setPicked((prev) => {
      if (prev.some((p) => p.id === u.id)) return prev.filter((p) => p.id !== u.id);
      if (prev.length >= MAX_PICK) {
        toast(`A group can have at most ${MAX_GROUP} members`);
        return prev;
      }
      return [...prev, u];
    });
  }

  async function create() {
    const name = title.trim();
    if (picked.length < 2 || !name) return;
    setBusy(true);
    try {
      const r = await api.post<{ conversation: Conversation }>('/conversations/group', {
        title: name,
        memberIds: picked.map((p) => p.id),
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onOpenChange(false);
      reset();
      navigate(`/chats/${r.conversation.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title={step === 1 ? 'New group' : 'Name your group'}
      hideHeader
    >
      <div className="relative flex shrink-0 items-center gap-1 border-b border-line px-2 pb-2 pt-3">
        <span aria-hidden className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" />
        {step === 2 ? (
          <IconButton label="Back to member selection" onClick={() => setStep(1)}>
            <ArrowLeft className="size-5" />
          </IconButton>
        ) : (
          <span className="w-10" />
        )}
        <h2 className="mt-1 flex-1 text-center font-display text-[1.0625rem] font-bold sm:mt-0">
          {step === 1 ? 'New group' : 'Name your group'}
        </h2>
        <span className="w-10" />
      </div>

      {step === 1 ? (
        <>
          <div className="px-4 pb-2 pt-2">
            <label className="flex h-11 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
              <Search className="size-4 text-fg-muted" />
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search people you follow"
                aria-label="Search people to add"
                className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none"
              />
            </label>
            {picked.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected members">
                {picked.map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-1 pr-2 text-[0.8125rem] font-semibold text-accent">
                    <Avatar user={p} size={22} />
                    {p.displayName}
                    <button type="button" onClick={() => toggle(p)} aria-label={`Remove ${p.displayName}`} className="rounded-full p-0.5 hover:bg-accent/20">
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-[220px] max-h-[46dvh] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8 text-accent">
                <Spinner />
              </div>
            ) : !candidates.length ? (
              <p className="px-4 py-10 text-center text-[0.9375rem] text-fg-muted">
                {filter ? 'No one matches your search' : 'Follow people (or get followers) to add them to a group'}
              </p>
            ) : (
              candidates.map((u) => {
                const on = pickedIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u)}
                    aria-pressed={on}
                    className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-bg-hover"
                  >
                    <Avatar user={u} size={44} />
                    <span className="min-w-0 flex-1 leading-5">
                      <span className="block truncate font-bold">{u.displayName}</span>
                      <span className="block truncate text-[0.8125rem] text-fg-muted">@{u.username}</span>
                    </span>
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}
                      aria-hidden
                    >
                      {on && <Check className="size-4" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-line p-4">
            <Button block size="lg" disabled={picked.length < 2} onClick={() => setStep(2)}>
              {picked.length < 2 ? 'Pick at least 2 people' : `Next · ${picked.length} selected`}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-1.5" aria-label="Group members">
            {picked.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-bg-muted py-1 pl-1 pr-2.5 text-[0.8125rem] font-semibold">
                <Avatar user={p} size={22} />
                {p.displayName}
              </span>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[0.8125rem] font-semibold text-fg-muted">Group name</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              placeholder="e.g. Weekend plans"
              aria-label="Group name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim()) {
                  e.preventDefault();
                  create();
                }
              }}
              className="h-12 w-full rounded-2xl bg-bg-muted px-4 text-[1rem] outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="mt-1 block text-right text-[0.75rem] text-fg-subtle">{[...title.trim()].length}/50</span>
          </label>
          <Button block size="lg" disabled={!title.trim()} loading={busy} onClick={create}>
            Create group
          </Button>
        </div>
      )}
    </Sheet>
  );
}
