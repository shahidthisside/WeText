/**
 * Persist composer draft *text* per context (new note, reply to a post, quote a
 * post) in localStorage. No attachments, polls or moods are saved. Writes are
 * debounced by the caller; reads are defensive against corrupt JSON.
 */

const VERSION = 'v1';
const PREFIX = `wt:draft:${VERSION}:`;

export type DraftContext = { kind: 'new' } | { kind: 'reply'; id: string } | { kind: 'quote'; id: string };

function keyFor(ctx: DraftContext): string {
  if (ctx.kind === 'new') return `${PREFIX}new`;
  return `${PREFIX}${ctx.kind}:${ctx.id}`;
}

interface StoredDraft {
  text: string;
  at: number;
}

export function loadDraft(ctx: DraftContext): string | null {
  try {
    const raw = localStorage.getItem(keyFor(ctx));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const text = (parsed as StoredDraft).text;
    if (typeof text !== 'string' || !text.trim()) return null;
    return text;
  } catch {
    return null;
  }
}

export function saveDraft(ctx: DraftContext, text: string): void {
  try {
    if (!text.trim()) {
      clearDraft(ctx);
      return;
    }
    const payload: StoredDraft = { text, at: Date.now() };
    localStorage.setItem(keyFor(ctx), JSON.stringify(payload));
  } catch {
    // Storage full or unavailable (private mode); drafts are best-effort.
  }
}

export function clearDraft(ctx: DraftContext): void {
  try {
    localStorage.removeItem(keyFor(ctx));
  } catch {
    // ignore
  }
}

/** Describe the composer context from its props so each has its own draft slot. */
export function draftContext(opts: { replyToId?: string; quoteId?: string; isEdit?: boolean }): DraftContext | null {
  if (opts.isEdit) return null; // never persist edits
  if (opts.replyToId) return { kind: 'reply', id: opts.replyToId };
  if (opts.quoteId) return { kind: 'quote', id: opts.quoteId };
  return { kind: 'new' };
}
