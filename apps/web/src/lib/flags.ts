import { useSyncExternalStore } from 'react';

/** Tiny persisted boolean flags (dismissed tips, "visited Connect", ...). */
const listeners = new Set<() => void>();
const key = (k: string) => `wt:flag:${k}`;

export function getFlag(k: string): boolean {
  try {
    return localStorage.getItem(key(k)) === '1';
  } catch {
    return false;
  }
}

export function setFlag(k: string, v: boolean) {
  try {
    if (v) localStorage.setItem(key(k), '1');
    else localStorage.removeItem(key(k));
  } catch {
    /* storage unavailable: ignore */
  }
  listeners.forEach((l) => l());
}

export function useFlag(k: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getFlag(k),
  );
}
