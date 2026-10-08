import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useAuthedMe } from '../../lib/auth';
import { queryClient } from '../../lib/query';
import type { Conversation, UserCard, UserSummary } from '../../lib/types';
import { Avatar, Button, Spinner } from '../ui';
import { Sheet } from './sheet';

type Candidate = Pick<UserSummary, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isPrivate'>;

/** Add members to an existing group. Excludes current members. */
export function AddPeopleSheet({
  conversationId,
  excludeIds,
  open,
  onClose,
}: {
  conversationId: string;
  excludeIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const me = useAuthedMe();
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const exclude = useMemo(() => new Set([me.id, ...excludeIds]), [me.id, excludeIds]);

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
  const search = useQuery({
    queryKey: ['dm-search', filter],
    queryFn: () => api.get<{ users: UserCard[] }>(`/search?q=${encodeURIComponent(filter)}&type=people`),
    enabled: open && filter.trim().length > 0,
  });

  const candidates = useMemo(() => {
    const map = new Map<string, Candidate>();
    const add = (u: UserCard | UserSummary) => {
      if (exclude.has(u.id)) return;
      if (!map.has(u.id)) map.set(u.id, { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, isPrivate: u.isPrivate });
    };
    for (const u of following.data?.users ?? []) add(u);
    for (const u of followers.data?.users ?? []) add(u);
    const f = filter.trim().toLowerCase();
    if (f) for (const u of search.data?.users ?? []) add(u);
    let list = [...map.values()];
    if (f) list = list.filter((u) => u.displayName.toLowerCase().includes(f) || u.username.toLowerCase().includes(f));
    return list;
  }, [following.data, followers.data, search.data, filter, exclude]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function reset() {
    setFilter('');
    setPicked([]);
    setBusy(false);
  }

  async function add() {
    if (!picked.length) return;
    setBusy(true);
    try {
      await api.post<{ conversation: Conversation }>(`/conversations/${conversationId}/members`, { userIds: picked });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast(`Added ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`);
      reset();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const loading = following.isPending || followers.isPending;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }} title="Add people">
      <div className="px-4 pb-2 pt-1">
        <label className="flex h-11 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-4 text-fg-muted" />
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people"
            aria-label="Search people to add"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none"
          />
        </label>
      </div>
      <div className="min-h-[200px] max-h-[48dvh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8 text-accent"><Spinner /></div>
        ) : !candidates.length ? (
          <p className="px-4 py-10 text-center text-fg-muted">{filter ? 'No one matches your search' : 'No one left to add'}</p>
        ) : (
          candidates.map((u) => {
            const on = picked.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                aria-pressed={on}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-bg-hover"
              >
                <Avatar user={u} size={44} />
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate font-bold">{u.displayName}</span>
                  <span className="block truncate text-[0.8125rem] text-fg-muted">@{u.username}</span>
                </span>
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`} aria-hidden>
                  {on && <Check className="size-4" />}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="border-t border-line p-4">
        <Button block size="lg" disabled={!picked.length} loading={busy} onClick={add}>
          {picked.length ? `Add ${picked.length}` : 'Select people'}
        </Button>
      </div>
    </Sheet>
  );
}
