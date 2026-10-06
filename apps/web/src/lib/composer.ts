import { useSyncExternalStore } from 'react';
import type { DailyPrompt, Post } from './types';

/** Global state for the "write" sheet (new note, whisper, reply, quote, edit, prompt answer). */
export interface ComposerState {
  open: boolean;
  replyTo?: Post;
  quote?: Post;
  edit?: Post;
  prompt?: Pick<DailyPrompt, 'key' | 'text'>;
  whisper?: boolean;
}

let state: ComposerState = { open: false };
const listeners = new Set<() => void>();
const set = (s: ComposerState) => {
  state = s;
  listeners.forEach((l) => l());
};

export const openComposer = (opts: Omit<ComposerState, 'open'> = {}) => set({ open: true, ...opts });
export const closeComposer = () => set({ open: false });

export function useComposerState() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
