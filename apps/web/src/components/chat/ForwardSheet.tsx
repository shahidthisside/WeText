import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import type { Conversation, Message } from '../../lib/types';
import { previewText, convTitle } from '../../lib/chat';
import { useAuthedMe } from '../../lib/auth';
import { Avatar, Button, Spinner } from '../ui';
import { GroupAvatar } from './GroupAvatar';
import { Sheet } from './sheet';

/** Pick up to 5 conversations to forward a message into. */
export function ForwardSheet({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const me = useAuthedMe();
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ['conversations', 'primary'],
    queryFn: () => api.get<{ items: Conversation[] }>('/conversations?tab=primary'),
    enabled: !!message,
  });

  const items = (q.data?.items ?? []).filter((c) => {
    if (c.isGroup && c.left) return false;
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    return convTitle(c).toLowerCase().includes(f) || (c.other?.username.toLowerCase().includes(f) ?? false);
  });

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= 5) {
          toast('You can forward to at most 5 chats');
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  async function doForward() {
    if (!message || picked.size === 0) return;
    setBusy(true);
    try {
      const r = await api.post<{ sent: number; failed: { conversationId: string; reason: string }[] }>(`/messages/${message.id}/forward`, {
        conversationIds: [...picked],
      });
      if (r.sent > 0) toast(`Forwarded to ${r.sent} ${r.sent === 1 ? 'chat' : 'chats'}`);
      if (r.failed.length) toast.error(`Couldn’t forward to ${r.failed.length} ${r.failed.length === 1 ? 'chat' : 'chats'}`);
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setPicked(new Set());
    setFilter('');
    onClose();
  }

  return (
    <Sheet open={!!message} onOpenChange={(o) => !o && close()} title="Forward to…">
      <div className="px-4 pb-2">
        <label className="flex h-11 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-4 text-fg-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats to forward to"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none"
          />
        </label>
      </div>
      <div className="max-h-[46dvh] overflow-y-auto">
        {q.isPending ? (
          <div className="flex justify-center py-8 text-accent">
            <Spinner />
          </div>
        ) : !items.length ? (
          <p className="px-4 py-8 text-center text-fg-muted">No chats found</p>
        ) : (
          items.map((c) => {
            const on = picked.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-bg-hover"
              >
                {c.isGroup ? <GroupAvatar title={c.title} members={c.members} size={44} /> : <Avatar user={c.other} size={44} />}
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate font-bold">{convTitle(c)}</span>
                  <span className="block truncate text-[0.8125rem] text-fg-muted">{previewText(c, me.id)}</span>
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
        <Button block size="lg" disabled={picked.size === 0} loading={busy} onClick={doForward}>
          {picked.size ? `Forward to ${picked.size}` : 'Select chats'}
        </Button>
      </div>
    </Sheet>
  );
}
