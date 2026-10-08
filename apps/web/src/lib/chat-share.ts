import { useSyncExternalStore } from 'react';

/**
 * A tiny external store that drives the "Share a note into a chat" sheet.
 *
 * The post share menu lives in a general_web-owned file (PostCard / PostParts),
 * so to share a note into a chat it should call `openSendPost(post.id)`. The
 * <ShareToChat /> sheet (mounted once in Layout) listens here and opens.
 */

let currentPostId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Open the Share-to-chat sheet for a given post id. Safe to call anywhere. */
export function openSendPost(postId: string) {
  currentPostId = postId;
  emit();
}

export function closeSendPost() {
  currentPostId = null;
  emit();
}

/** Subscribe to the currently-shared post id (null when the sheet is closed). */
export function useSendPost(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentPostId,
    () => null,
  );
}
