import { ImagePlus, Smile, SendHorizontal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadImage, errorMessage } from '../../lib/api';
import { usePrefs } from '../../lib/prefs';
import { getSocket } from '../../lib/socket';
import { clearDraft, readDraft, writeDraft } from '../../lib/chat';
import { uploadAudio } from '../../lib/chat-audio';
import type { Message } from '../../lib/types';
import { cn } from '../../lib/utils';
import { IconButton, Spinner } from '../ui';
import { EmojiPicker } from './EmojiPicker';
import { VoiceRecorderControl } from './VoiceRecorderControl';

export interface OutgoingMessage {
  body: string;
  image?: { url: string; width: number; height: number } | null;
  audio?: { url: string; durationMs: number } | null;
  replyToId?: string | null;
}

type PendingImage = { preview: string; uploaded?: { url: string; width: number; height: number } };

export function Composer({
  conversationId,
  replyTo,
  onClearReply,
  otherName,
  onSend,
  meId,
}: {
  conversationId: string;
  replyTo: Message | null;
  onClearReply: () => void;
  otherName: string;
  /** Fire the actual send; the composer stays dumb about optimistic cache. */
  onSend: (msg: OutgoingMessage) => void | Promise<void>;
  meId: string;
}) {
  const prefs = usePrefs();
  const [text, setText] = useState('');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [emoji, setEmoji] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the saved draft when switching conversation.
  useEffect(() => {
    setText(readDraft(conversationId));
    setImages([]);
    setTimeout(() => ta.current?.focus(), 40);
  }, [conversationId]);

  useEffect(() => {
    ta.current?.focus();
  }, [replyTo]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  // Debounced, versioned draft persistence.
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => writeDraft(conversationId, text), 400);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [text, conversationId]);

  async function pickImages(files: File[]) {
    const slots = Math.max(0, 4 - images.length);
    const take = files.filter((f) => f.type.startsWith('image/')).slice(0, slots);
    for (const f of take) {
      const preview = URL.createObjectURL(f);
      setImages((prev) => [...prev, { preview }]);
      try {
        const up = await uploadImage(f, 'media');
        setImages((prev) => prev.map((p) => (p.preview === preview ? { preview, uploaded: up } : p)));
      } catch (e) {
        toast.error(errorMessage(e));
        setImages((prev) => prev.filter((p) => p.preview !== preview));
      }
    }
  }

  const uploading = images.some((im) => !im.uploaded);
  const canSend = (text.trim().length > 0 || images.some((im) => im.uploaded)) && !uploading;

  async function doSend() {
    const body = text.trim();
    const ready = images.filter((im) => im.uploaded);
    if (!body && !ready.length) return;

    clearDraft(conversationId);
    setText('');
    setImages([]);
    setEmoji(false);

    if (ready.length) {
      // Each image is its own message; the first carries the caption.
      for (let i = 0; i < ready.length; i++) {
        await onSend({ body: i === 0 ? body : '', image: ready[i]!.uploaded!, replyToId: i === 0 ? replyTo?.id ?? null : null });
      }
    } else {
      await onSend({ body, replyToId: replyTo?.id ?? null });
    }
    onClearReply();
  }

  function onChange(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2000) {
      lastTyping.current = now;
      getSocket().emit('typing', { conversationId });
    }
  }

  async function onVoiceComplete(blob: Blob, durationMs: number) {
    const toastId = toast.loading('Sending voice message…');
    try {
      const up = await uploadAudio(blob);
      await onSend({ body: '', audio: { url: up.url, durationMs } });
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(errorMessage(e));
    }
  }

  function onRecordingChange(on: boolean) {
    getSocket().emit('recording', { conversationId, on });
  }

  const [recording, setRecording] = useState(false);

  return (
    <div
      className={cn(
        'shrink-0 border-t border-line bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-3 sm:pb-3',
        dragOver && 'ring-2 ring-inset ring-accent',
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pickImages([...e.dataTransfer.files]);
      }}
    >
      {replyTo && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-bg-muted px-3 py-2 text-[0.875rem]">
          <span className="h-8 w-1 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-accent">Replying to {replyTo.senderId === meId ? 'yourself' : otherName}</p>
            <p className="truncate text-fg-muted">{replyTo.body || (replyTo.image ? 'Photo' : replyTo.audio ? 'Voice message' : 'Message')}</p>
          </div>
          <IconButton label="Cancel reply" className="size-7" onClick={onClearReply}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((im) => (
            <div key={im.preview} className="relative">
              <img src={im.preview} alt="" className="size-20 rounded-xl object-cover" />
              {!im.uploaded && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 text-white">
                  <Spinner className="size-5" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((p) => p.preview !== im.preview))}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-black/80 text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-1 rounded-[24px] bg-bg-muted px-2 py-1 transition-shadow focus-within:ring-2 focus-within:ring-accent/40',
          recording && 'min-h-[48px] items-center',
        )}
      >
        {/* While recording, hide the composing controls but keep the SINGLE
            VoiceRecorderControl mounted so its live recording state survives. */}
        {!recording && (
          <>
            <input
              ref={file}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              pickImages([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <IconButton label="Add photo" tone="accent" disabled={images.length >= 4} onClick={() => file.current?.click()}>
            <ImagePlus className="size-5" />
          </IconButton>

          {/* Emoji button — desktop only (OS keyboard provides emoji on phones) */}
          <div className="relative hidden sm:block">
            <IconButton label="Add emoji" tone="accent" onClick={() => setEmoji((v) => !v)}>
              <Smile className="size-5" />
            </IconButton>
            {emoji && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setEmoji(false)} aria-hidden />
                <div className="absolute bottom-full left-0 z-20 mb-2">
                  <EmojiPicker
                    onPick={(e) => {
                      setText((t) => t + e);
                      ta.current?.focus();
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <textarea
            ref={ta}
            value={text}
            rows={1}
            maxLength={2000}
            aria-label="Message"
            placeholder="Message"
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
              if (imgs.length) {
                e.preventDefault();
                pickImages(imgs);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && (prefs.sendOnEnter || e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                doSend();
              }
              if (e.key === 'Escape' && replyTo) onClearReply();
            }}
            className="max-h-36 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-[7px] text-[0.9375rem] leading-[1.375rem] outline-none placeholder:text-fg-muted"
          />
          </>
        )}

        {/* Send button: only when there is content and we're not recording. */}
        {!recording && (canSend || text.trim()) && (
          <IconButton label="Send" tone="accent" onClick={doSend} disabled={!canSend}>
            <SendHorizontal className="size-5" />
          </IconButton>
        )}

        {/* A SINGLE voice recorder instance, always mounted (so starting a
            recording never unmounts the component mid-record). It renders the
            idle mic when there's nothing to send, and expands to the full
            recording UI (which takes the row width) while recording. */}
        {!recording && (canSend || text.trim()) ? null : (
          <VoiceRecorderControl onComplete={onVoiceComplete} onRecordingChange={(on) => (setRecording(on), onRecordingChange(on))} />
        )}
      </div>
    </div>
  );
}
