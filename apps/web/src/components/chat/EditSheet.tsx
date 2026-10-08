import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import type { Message } from '../../lib/types';
import { EDIT_WINDOW_MS, replaceMessage } from '../../lib/chat';
import { Button } from '../ui';
import { Sheet } from './sheet';

/** Inline edit for your own text message, within the 15-minute window. */
export function EditSheet({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (message) {
      setText(message.body);
      setTimeout(() => ta.current?.focus(), 60);
    }
  }, [message]);

  const remainingMin = message ? Math.max(0, Math.ceil((EDIT_WINDOW_MS - (Date.now() - message.createdAt)) / 60000)) : 0;

  async function save() {
    if (!message) return;
    const body = text.trim();
    if (!body && !message.image) {
      toast.error('Message can’t be empty');
      return;
    }
    setBusy(true);
    try {
      const r = await api.patch<{ message: Message }>(`/messages/${message.id}`, { body });
      replaceMessage(message.conversationId, r.message);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!message} onOpenChange={(o) => !o && onClose()} title="Edit message">
      <div className="p-4">
        <textarea
          ref={ta}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          aria-label="Edit message text"
          className="min-h-[96px] w-full resize-none rounded-2xl border border-line-strong bg-card p-3.5 text-[0.9375rem] outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        <p className="mt-2 px-1 text-[0.8125rem] text-fg-muted">
          You can edit for {remainingMin} more {remainingMin === 1 ? 'minute' : 'minutes'}. Edited messages are marked “edited”.
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" size="lg" block onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" block loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
