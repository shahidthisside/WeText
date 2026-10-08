import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import type { Message } from '../../lib/types';
import { shortTime } from '../../lib/utils';
import { Spinner } from '../ui';
import { Sheet } from './sheet';

/** Search within a conversation. Tapping a result jumps to that message. */
export function SearchSheet({ conversationId, open, onClose, onJump }: { conversationId: string; open: boolean; onClose: () => void; onJump: (messageId: string) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim();
  const res = useQuery({
    queryKey: ['conv-search', conversationId, term],
    queryFn: () => api.get<{ items: Message[] }>(`/conversations/${conversationId}/search?q=${encodeURIComponent(term)}`),
    enabled: open && term.length >= 2,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && (setQ(''), onClose())} title="Search in chat">
      <div className="px-4 pb-2">
        <label className="flex h-11 items-center gap-3 rounded-full bg-bg-muted px-4 focus-within:ring-2 focus-within:ring-accent">
          <Search className="size-4 text-fg-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" aria-label="Search messages" className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none" />
        </label>
      </div>
      <div className="max-h-[52dvh] overflow-y-auto pb-2">
        {term.length < 2 ? (
          <p className="px-4 py-8 text-center text-fg-muted">Type at least 2 characters</p>
        ) : res.isFetching ? (
          <div className="flex justify-center py-8 text-accent">
            <Spinner />
          </div>
        ) : !res.data?.items.length ? (
          <p className="px-4 py-8 text-center text-fg-muted">No matches</p>
        ) : (
          res.data.items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onJump(m.id);
                setQ('');
                onClose();
              }}
              className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[0.9375rem]">{m.body}</span>
                <span className="mt-0.5 block text-[0.75rem] text-fg-muted">{shortTime(m.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}
