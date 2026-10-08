import { useQuery } from '@tanstack/react-query';
import { BarChart3, Hourglass, ImagePlus, Plus, Smile, VenetianMask, X } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage, uploadImage, type Uploaded } from '../lib/api';
import { useAuthedMe } from '../lib/auth';
import { clearDraft, draftContext, loadDraft, saveDraft } from '../lib/drafts';
import { queryClient, updatePostEverywhere } from '../lib/query';
import type { DailyPrompt, Post, UserSummary } from '../lib/types';
import { MOODS } from '../lib/moods';
import { cn } from '../lib/utils';
import { Avatar, Button, IconButton, Spinner } from './ui';
import { QuoteEmbed } from './PostCard';

const MAX = 500;
const ALT_MAX = 300;

interface Attachment {
  id: string;
  preview: string;
  uploaded?: Uploaded;
  error?: boolean;
  alt: string;
}

export interface ComposerProps {
  replyTo?: Post;
  quote?: Post;
  edit?: Post;
  prompt?: Pick<DailyPrompt, 'key' | 'text'>;
  startWhisper?: boolean;
  autoFocus?: boolean;
  /** Inline composer (home feed) vs modal. */
  variant?: 'inline' | 'modal';
  placeholder?: string;
  onDone?: (post: Post) => void;
}

export function Composer({ replyTo, quote, edit, prompt, startWhisper, autoFocus, variant = 'modal', placeholder, onDone }: ComposerProps) {
  const me = useAuthedMe();
  const ctx = draftContext({ replyToId: replyTo?.id, quoteId: quote?.id, isEdit: !!edit });
  // Restore a persisted draft once, for new notes / replies / quotes (never edits).
  const [initialText] = useState(() => (edit ? edit.content : (ctx && loadDraft(ctx)) || ''));
  const [draftRestored, setDraftRestored] = useState(() => !edit && !!ctx && !!loadDraft(ctx));
  const [text, setText] = useState(initialText);
  const [anon, setAnon] = useState(!!startWhisper);
  const [mood, setMood] = useState<string | null>(edit?.mood ?? null);
  const [fade, setFade] = useState(false);
  const [showMoods, setShowMoods] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [altEditing, setAltEditing] = useState<string | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [pollHours, setPollHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const inputId = useId();

  // Track every object URL we create so we can revoke them exactly once on
  // unmount regardless of how attachments were added, replaced or removed.
  const objectUrls = useRef<Set<string>>(new Set());
  const revoke = useCallback((url: string) => {
    if (objectUrls.current.has(url)) {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
    }
  }, []);

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) {
      const el = ta.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [autoFocus]);

  // Persist the draft text (debounced). Attachments/polls/moods are not saved.
  useEffect(() => {
    if (!ctx) return;
    const h = setTimeout(() => saveDraft(ctx, text), 400);
    return () => clearTimeout(h);
  }, [ctx, text]);

  // Revoke every object URL this composer created when it unmounts.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
    };
  }, []);

  const uploading = files.some((f) => !f.uploaded && !f.error);
  const len = [...text.trim()].length;
  const over = len > MAX;
  const pollValid = !poll || poll.filter((o) => o.trim()).length >= 2;
  const canSubmit =
    !submitting && !uploading && !over && pollValid && (len > 0 || files.some((f) => f.uploaded) || !!quote) && !(poll && len === 0);

  function removeAttachment(id: string) {
    setFiles((fs) => {
      const target = fs.find((f) => f.id === id);
      if (target) revoke(target.preview);
      return fs.filter((f) => f.id !== id);
    });
    setAltEditing((cur) => (cur === id ? null : cur));
  }

  function discardDraft() {
    setText('');
    setDraftRestored(false);
    if (ctx) clearDraft(ctx);
    ta.current?.focus();
  }

  async function addFiles(list: FileList | File[]) {
    const arr = [...list].filter((f) => f.type.startsWith('image/'));
    const room = 4 - files.length;
    if (arr.length > room) toast('You can attach up to 4 images');
    for (const file of arr.slice(0, room)) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 8 MB`);
        continue;
      }
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      const att: Attachment = { id: crypto.randomUUID(), preview, alt: '' };
      setFiles((f) => [...f, att]);
      setPoll(null);
      uploadImage(file, 'media')
        .then((uploaded) => setFiles((fs) => fs.map((f) => (f.id === att.id ? { ...f, uploaded } : f))))
        .catch((e) => {
          toast.error(errorMessage(e));
          revoke(preview);
          setFiles((fs) => fs.filter((f) => f.id !== att.id));
        });
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let post: Post;
      if (edit) {
        post = (await api.patch<{ post: Post }>(`/posts/${edit.id}`, { content: text })).post;
        updatePostEverywhere(post.id, () => post);
        toast('Post updated');
      } else {
        post = (
          await api.post<{ post: Post }>('/posts', {
            content: text,
            isAnonymous: anon,
            mood,
            fade,
            promptKey: prompt?.key,
            replyToId: replyTo?.id,
            quoteOfId: quote?.id,
            media: files.filter((f) => f.uploaded).map((f) => ({ ...f.uploaded!, alt: f.alt.trim().slice(0, ALT_MAX) })),
            poll: poll ? { options: poll.map((o) => o.trim()).filter(Boolean), durationHours: pollHours } : null,
          })
        ).post;
        if (replyTo) {
          updatePostEverywhere(replyTo.id, (p) => ({ ...p, counts: { ...p.counts, replies: p.counts.replies + 1 } }));
          queryClient.invalidateQueries({ queryKey: ['replies', replyTo.id] });
        }
        if (quote) updatePostEverywhere(quote.id, (p) => ({ ...p, counts: { ...p.counts, quotes: p.counts.quotes + 1 } }));
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['prompt'] });
        queryClient.invalidateQueries({ queryKey: ['pulse'] });
        queryClient.invalidateQueries({ queryKey: ['profile-posts', me.username] });
        queryClient.invalidateQueries({ queryKey: ['trending'] });
        toast(replyTo ? 'Reply sent' : anon ? 'Whisper sent. Nobody will know it’s you.' : fade ? 'Posted. It will fade in 24 hours.' : 'Note posted', {
          action: { label: 'View', onClick: () => (window.location.href = `/post/${post.id}`) },
        });
      }
      setText('');
      setFiles((fs) => {
        fs.forEach((f) => revoke(f.preview));
        return [];
      });
      setPoll(null);
      setAnon(false);
      setMood(null);
      setFade(false);
      setDraftRestored(false);
      if (ctx) clearDraft(ctx);
      onDone?.(post);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ---- @mention autocomplete
  const mentionMatch = /(^|\s)@([a-zA-Z0-9_]{1,20})$/.exec(text.slice(0, caret));
  const mentionQ = mentionMatch?.[2] ?? '';
  const mentions = useQuery({
    queryKey: ['mentions', mentionQ],
    queryFn: () => api.get<{ users: UserSummary[] }>(`/mentions?q=${encodeURIComponent(mentionQ)}`),
    enabled: mentionQ.length > 0,
    staleTime: 60_000,
  });
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionList = mentionQ ? (mentions.data?.users ?? []) : [];
  function pickMention(u: UserSummary) {
    const before = text.slice(0, caret).replace(/@([a-zA-Z0-9_]{1,20})$/, `@${u.username} `);
    const next = before + text.slice(caret);
    setText(next);
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  }

  const ring = Math.min(len / MAX, 1);
  const remaining = MAX - len;

  const whisperMode = anon && !edit;
  return (
    <div className={cn('px-4 sm:px-6', variant === 'inline' ? 'py-4' : 'pb-2 pt-1')}>
      {prompt && (
        <div className="mb-4 rounded-2xl bg-accent-soft px-4 py-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-accent">Today’s prompt</p>
          <p className="mt-0.5 font-serif text-[1.5rem] italic leading-tight">{prompt.text}</p>
        </div>
      )}
      {replyTo && !edit && (
        <p className="mb-2 text-[0.875rem] text-fg-muted">
          Replying to <span className="font-semibold text-accent">{replyTo.author ? `@${replyTo.author.username}` : 'a whisper'}</span>
        </p>
      )}
      {draftRestored && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-bg-muted px-3 py-2 text-[0.8125rem] text-fg-muted">
          <span>Draft restored</span>
          <button type="button" className="font-semibold text-danger hover:underline" onClick={discardDraft}>
            Discard
          </button>
        </div>
      )}

      <div className={cn('rounded-[22px] transition-colors', whisperMode ? 'bg-whisper p-4 text-on-whisper' : variant === 'inline' ? 'border border-line bg-card p-4 shadow-paper' : 'bg-bg-muted/60 p-4')}>
        <div className="flex gap-3">
          <Avatar user={whisperMode ? null : me} anonymous={whisperMode} size={38} />
          <div className="relative min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">
              Note text
            </label>
            <textarea
              id={inputId}
              ref={ta}
              value={text}
              rows={variant === 'modal' ? 4 : 2}
              placeholder={placeholder ?? (replyTo ? 'Write your reply…' : prompt ? 'Your answer…' : whisperMode ? 'Say what you can’t say out loud…' : 'What’s on your mind?')}
              className={cn(
                'block max-h-[45vh] w-full resize-none bg-transparent py-1 leading-snug outline-none',
                whisperMode ? 'font-serif text-[1.65rem] placeholder:text-on-whisper-muted' : 'text-[1.125rem] placeholder:text-fg-subtle',
              )}
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionStart);
                setMentionIdx(0);
                if (draftRestored) setDraftRestored(false);
              }}
              onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
              onFocus={() => setFocused(true)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  addFiles(e.clipboardData.files);
                }
              }}
              onKeyDown={(e) => {
                if (mentionList.length) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionIdx((i) => (i + 1) % mentionList.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIdx((i) => (i - 1 + mentionList.length) % mentionList.length);
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    pickMention(mentionList[mentionIdx]!);
                    return;
                  }
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
              }}
            />
            {mentionList.length > 0 && (
              <ul className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-2xl border border-line bg-card p-1 text-fg shadow-xl" role="listbox">
                {mentionList.map((u, i) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', i === mentionIdx && 'bg-bg-hover')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMention(u);
                      }}
                    >
                      <Avatar user={u} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{u.displayName}</span>
                        <span className="block truncate text-[0.75rem] text-fg-muted">@{u.username}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {files.length > 0 && (
          <div className={cn('mt-3 grid gap-2', files.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {files.map((f) => (
              <div key={f.id} className="relative min-h-[120px] overflow-hidden rounded-2xl bg-bg-muted">
                <img src={f.preview} alt={f.alt.trim() || ''} className={cn('w-full object-cover', files.length === 1 ? 'max-h-[320px] min-h-[120px]' : 'aspect-square')} />
                {!f.uploaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                    <Spinner />
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85"
                  onClick={() => removeAttachment(f.id)}
                >
                  <X className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={f.alt.trim() ? 'Edit photo description' : 'Add a description for this photo'}
                  onClick={() => setAltEditing((cur) => (cur === f.id ? null : f.id))}
                  className={cn(
                    'absolute bottom-2 left-2 flex h-7 items-center rounded-full px-2 text-[0.6875rem] font-bold uppercase tracking-wide',
                    f.alt.trim() ? 'bg-accent text-on-accent' : 'bg-black/70 text-white hover:bg-black/85',
                  )}
                >
                  {f.alt.trim() ? 'Alt ✓' : '+ Alt'}
                </button>
                {altEditing === f.id && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2.5">
                    <label htmlFor={`alt-${f.id}`} className="sr-only">
                      Describe this photo for people who can’t see it
                    </label>
                    <textarea
                      id={`alt-${f.id}`}
                      autoFocus
                      rows={2}
                      maxLength={ALT_MAX}
                      value={f.alt}
                      placeholder="Describe this photo for people who can’t see it…"
                      onChange={(e) => setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, alt: e.target.value } : x)))}
                      className="w-full resize-none rounded-lg bg-white/95 p-2 text-[0.8125rem] text-black outline-none"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[0.6875rem] text-white/70">
                      <span className="tabular-nums">
                        {f.alt.length} / {ALT_MAX}
                      </span>
                      <button type="button" className="font-semibold text-white hover:underline" onClick={() => setAltEditing(null)}>
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {poll && (
          <div className="mt-3 rounded-2xl border border-line-strong/60 bg-card p-3 text-fg">
            <div className="space-y-2">
              {poll.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    maxLength={40}
                    aria-label={`Choice ${i + 1}`}
                    placeholder={`Choice ${i + 1}${i > 1 ? ' (optional)' : ''}`}
                    onChange={(e) => setPoll(poll.map((o, j) => (j === i ? e.target.value : o)))}
                    className="h-11 flex-1 rounded-xl border border-line-strong bg-transparent px-3 outline-none focus:border-accent"
                  />
                  {i === poll.length - 1 && poll.length < 4 && (
                    <IconButton label="Add choice" tone="accent" onClick={() => setPoll([...poll, ''])}>
                      <Plus className="size-5" />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-[0.875rem]">
              <label className="flex items-center gap-2 text-fg-muted">
                Length
                <select value={pollHours} onChange={(e) => setPollHours(Number(e.target.value))} className="rounded-lg border border-line-strong bg-card px-2 py-1 text-fg">
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>1 day</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                </select>
              </label>
              <button type="button" className="font-semibold text-danger hover:underline" onClick={() => setPoll(null)}>
                Remove poll
              </button>
            </div>
          </div>
        )}

        {quote && <QuoteEmbed post={quote} className="mt-3 text-fg" />}

        {showMoods && !edit && (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Mood">
            {MOODS.map((m) => {
              const on = mood === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMood(on ? null : m.key)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[0.8125rem] font-semibold transition-colors',
                    on ? 'border-transparent' : whisperMode ? 'border-white/20 hover:bg-white/10' : 'border-line-strong bg-card hover:bg-bg-hover',
                  )}
                  style={on ? { background: `color-mix(in srgb, ${m.color} 28%, transparent)` } : undefined}
                >
                  <span aria-hidden>{m.emoji}</span> {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(variant === 'modal' || focused || len > 0 || files.length > 0 || !!poll || !!prompt) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="-ml-2 flex flex-wrap items-center gap-0.5">
            {!edit && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Tool label="Photo" title="Add photos" icon={<ImagePlus />} disabled={files.length >= 4 || !!poll} onClick={() => fileInput.current?.click()} />
                <Tool label="Poll" title="Add a poll" icon={<BarChart3 />} disabled={files.length > 0 || !!poll || !!quote || !!prompt} onClick={() => setPoll(['', ''])} />
                <Tool
                  label={mood ? (MOODS.find((m) => m.key === mood)?.label ?? 'Mood') : 'Mood'}
                  title="Set a mood"
                  icon={mood ? <span className="text-base leading-none">{MOODS.find((m) => m.key === mood)?.emoji}</span> : <Smile />}
                  active={showMoods || !!mood}
                  onClick={() => setShowMoods((v) => !v)}
                />
                <Tool label="Fade" title={fade ? 'Keep this note' : 'Fade after 24 hours'} icon={<Hourglass />} active={fade} onClick={() => setFade((f) => !f)} />
                {!replyTo && !prompt && <Tool label="Whisper" title={anon ? 'Post with your name' : 'Whisper (anonymous)'} icon={<VenetianMask />} active={anon} onClick={() => setAnon((a) => !a)} />}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {len > 0 && (
              <span className="relative flex size-7 items-center justify-center" aria-label={`${remaining} characters remaining`}>
                <svg viewBox="0 0 24 24" className="absolute size-7 -rotate-90">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="var(--wt-line-strong)" strokeWidth="2" />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke={over ? 'var(--color-danger)' : remaining <= 20 ? '#d18b12' : 'var(--wt-accent)'}
                    strokeWidth="2.4"
                    strokeDasharray={`${ring * 62.83} 62.83`}
                    strokeLinecap="round"
                  />
                </svg>
                {remaining <= 20 && <span className={cn('text-[0.625rem] font-bold tabular-nums', over ? 'text-danger' : 'text-fg-muted')}>{remaining}</span>}
              </span>
            )}
            <Button onClick={submit} disabled={!canSubmit} loading={submitting}>
              {edit ? 'Save' : replyTo ? 'Reply' : whisperMode ? 'Whisper' : prompt ? 'Answer' : 'Post'}
            </Button>
          </div>
        </div>
      )}
      {fade && !edit && <p className="mt-2 text-[0.75rem] text-fg-muted">This note will disappear 24 hours after you post it.</p>}
    </div>
  );
}

/** Toolbar button: icon always, label from the `sm` breakpoint up so beginners can see what it does. */
function Tool({ label, title, icon, active, disabled, onClick }: { label: string; title: string; icon: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold transition-colors disabled:opacity-35 [&>svg]:size-[18px]',
        active ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-bg-hover hover:text-fg',
      )}
    >
      {icon}
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
}
