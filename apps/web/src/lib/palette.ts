import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  open = v;
  listeners.forEach((l) => l());
};

export const openPalette = () => set(true);
export const closePalette = () => set(false);
export const togglePalette = () => set(!open);

export function usePaletteOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
  );
}

/* ---- Help sheet ---- */
let helpOpen = false;
const helpListeners = new Set<() => void>();
const setHelp = (v: boolean) => {
  helpOpen = v;
  helpListeners.forEach((l) => l());
};
export const openHelp = () => setHelp(true);
export const closeHelp = () => setHelp(false);
export function useHelpOpen() {
  return useSyncExternalStore(
    (cb) => {
      helpListeners.add(cb);
      return () => helpListeners.delete(cb);
    },
    () => helpOpen,
  );
}
