import { useQuery } from '@tanstack/react-query';
import { Ban, Bell, BellOff, Hourglass, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { TTL_OPTIONS } from '../../lib/chat';
import { queryClient } from '../../lib/query';
import type { Conversation, Message } from '../../lib/types';
import { Avatar, ConfirmDialog, Spinner } from '../ui';
import { Sheet, SheetAction } from './sheet';
import { AudioBubble } from './AudioBubble';
import { Lightbox } from '../Media';

export function ConversationInfo({ c, onClose }: { c: Conversation; onClose: () => void }) {
  const navigate = useNavigate();
  // ConversationInfo only renders for 1:1 chats (groups use GroupInfo), so `other` is present.
  const other = c.other!;
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);
  const [tab, setTab] = useState<'about' | 'media' | 'audio'>('about');
  const [photo, setPhoto] = useState<string | null>(null);

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
  async function remove() {
    await api.del(`/conversations/${c.id}`);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.removeQueries({ queryKey: ['messages', c.id] });
    navigate('/chats');
    toast('Conversation deleted');
  }
  async function block() {
    await api.post(`/users/${other.username}/block`);
    queryClient.invalidateQueries({ queryKey: ['conversation', c.id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    onClose();
    toast(`Blocked @${other.username}`);
  }

  const media = useQuery({
    queryKey: ['conv-media', c.id, tab],
    queryFn: () => api.get<{ items: Message[] }>(`/conversations/${c.id}/media?kind=${tab === 'media' ? 'image' : 'audio'}`),
    enabled: tab === 'media' || tab === 'audio',
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Conversation info">
      <div className="flex flex-col items-center px-4 pb-2 pt-1 text-center">
        <Avatar user={c.other} size={72} />
        <p className="mt-2 font-display text-[1.125rem] font-bold">{other.displayName}</p>
        <p className="text-[0.875rem] text-fg-muted">@{other.username}</p>
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
          <div className="px-4 py-2">
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wide text-fg-subtle">
              <Hourglass className="size-4" /> Disappearing messages
            </p>
            <div className="mt-2 flex gap-2">
              {TTL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => patch({ ttlSeconds: o.value }, o.value ? `Messages disappear after ${o.label}` : 'Disappearing messages off')}
                  aria-pressed={c.ttlSeconds === o.value}
                  className={`flex-1 rounded-xl border px-2 py-2 text-[0.8125rem] font-semibold transition-colors ${
                    c.ttlSeconds === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-muted hover:bg-bg-hover'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-px bg-line" />
          <SheetAction icon={c.muted ? <Bell /> : <BellOff />} onClick={() => patch({ muted: !c.muted }, c.muted ? 'Conversation unmuted' : 'Conversation muted')}>
            {c.muted ? 'Unmute conversation' : 'Mute conversation'}
          </SheetAction>
          {!c.blockedByMe && (
            <SheetAction icon={<Ban />} danger onClick={() => setConfirm('block')}>
              Block @{other.username}
            </SheetAction>
          )}
          <SheetAction icon={<Trash2 />} danger onClick={() => setConfirm('delete')}>
            Delete conversation
          </SheetAction>
        </div>
      )}

      {tab === 'media' && (
        <div className="min-h-[160px] px-3 pb-4">
          {media.isPending ? (
            <div className="flex justify-center py-8 text-accent">
              <Spinner />
            </div>
          ) : !media.data?.items.length ? (
            <p className="py-8 text-center text-fg-muted">No photos yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {media.data.items.map(
                (m) =>
                  m.image && (
                    <button key={m.id} type="button" onClick={() => setPhoto(m.image!.url)} className="aspect-square overflow-hidden rounded-lg" aria-label="Open photo">
                      <img src={m.image.url} alt="" className="size-full object-cover" />
                    </button>
                  ),
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'audio' && (
        <div className="min-h-[160px] px-3 pb-4">
          {media.isPending ? (
            <div className="flex justify-center py-8 text-accent">
              <Spinner />
            </div>
          ) : !media.data?.items.length ? (
            <p className="py-8 text-center text-fg-muted">No voice messages yet</p>
          ) : (
            <div className="flex flex-col gap-1">
              {media.data.items.map(
                (m) => m.audio && <div key={m.id} className="rounded-2xl bg-bg-muted"><AudioBubble url={m.audio.url} durationMs={m.audio.durationMs} mine={false} seed={m.id} /></div>,
              )}
            </div>
          )}
        </div>
      )}

      <Lightbox media={photo ? [{ url: photo }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} onIndex={() => {}} />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete conversation?"
        body="This conversation will be deleted from your inbox. The other person will still be able to see it."
        confirmLabel="Delete"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={confirm === 'block'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Block @${other.username}?`}
        body="They won’t be able to message you, follow you, or see your posts."
        confirmLabel="Block"
        onConfirm={block}
      />
    </Sheet>
  );
}
