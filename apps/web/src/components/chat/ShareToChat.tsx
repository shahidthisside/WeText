import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { useAuthedMe } from '../../lib/auth';
import { useSendPost, closeSendPost } from '../../lib/chat-share';
import { previewText, convTitle } from '../../lib/chat';
import type { Conversation, Message, UserSummary } from '../../lib/types';
import { Avatar, Spinner } from '../ui';
import { GroupAvatar } from './GroupAvatar';
import { Sheet } from './sheet';

/**
 * Mounted once (in Layout). Opens when `openSendPost(postId)` is called from
 * anywhere (e.g. a post's share menu). Lets the user pick an existing chat or a
 * person, add an optional caption, and sends the note as a `postId` message.
 */
export function ShareToChat() {
  const postId = useSendPost();
  const me = useAuthedMe();
  const [filter, setFilter] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const convs = useQuery({
    queryKey: ['conversations', 'primary'],
    queryFn: () => api.get<{ items: Conversation[] }>('/conversations?tab=primary'),
    enabled: !!postId,
  });
  const people = useQuery({
    queryKey: ['dm-search', filter],
    queryFn: () => api.get<{ users: UserSummary[] }>(`/search?q=${encodeURIComponent(filter)}&type=people`),
    enabled: !!postId && filter.trim().length > 0,
  });

  const f = filter.trim().toLowerCase();
  const matchedConvs = (convs.data?.items ?? []).filter(
    (c) => !(c.isGroup && c.left) && (!f || convTitle(c).toLowerCase().includes(f) || (c.other?.username.toLowerCase().includes(f) ?? false)),
  );
  // People not already in a conversation shown in search mode.
  const convUsernames = new Set((convs.data?.items ?? []).map((c) => c.other?.username).filter((u): u is string => !!u));
  const extraPeople = f ? (people.data?.users ?? []).filter((u) => !convUsernames.has(u.username) && u.id !== me.id) : [];

  function close() {
    setFilter('');
    setCaption('');
    closeSendPost();
  }

  async function sendTo(conversationId: string) {
    if (!postId) return;
    setBusy(true);
    try {
      await api.post<{ message: Message }>(`/conversations/${conversationId}/messages`, { postId, body: caption.trim() });
      toast('Note sent');
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendToPerson(username: string) {
    if (!postId) return;
    setBusy(true);
    try {
      const r = await api.post<{ conversation: Conversation }>('/conversations', { username });
      await api.post<{ message: Message }>(`/conversations/${r.conversation.id}/messages`, { postId, body: caption.trim() });
      toast('Note sent');
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && close()} title="Send note in a message">
      <div className="px-4 pb-2">
        <label className="flex h-11 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-4 text-fg-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people"
            aria-label="Search people to send to"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none"
          />
        </label>
      </div>
      <div className="max-h-[42dvh] overflow-y-auto">
        {convs.isPending ? (
          <div className="flex justify-center py-8 text-accent">
            <Spinner />
          </div>
        ) : (
          <>
            {matchedConvs.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => sendTo(c.id)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-bg-hover disabled:opacity-50"
              >
                {c.isGroup ? <GroupAvatar title={c.title} members={c.members} size={44} /> : <Avatar user={c.other} size={44} />}
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate font-bold">{convTitle(c)}</span>
                  <span className="block truncate text-[0.8125rem] text-fg-muted">{previewText(c, me.id)}</span>
                </span>
              </button>
            ))}
            {extraPeople.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={busy}
                onClick={() => sendToPerson(u.username)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-bg-hover disabled:opacity-50"
              >
                <Avatar user={u} size={44} />
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate font-bold">{u.displayName}</span>
                  <span className="block truncate text-[0.8125rem] text-fg-muted">@{u.username}</span>
                </span>
              </button>
            ))}
            {!matchedConvs.length && !extraPeople.length && <p className="px-4 py-8 text-center text-fg-muted">No one found</p>}
          </>
        )}
      </div>
      <div className="border-t border-line p-4">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
          placeholder="Add a message (optional)"
          aria-label="Optional caption"
          className="h-11 w-full rounded-full bg-bg-muted px-4 text-[0.9375rem] outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
    </Sheet>
  );
}
