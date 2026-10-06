import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dim' | 'dark';
export type Accent = 'vermilion' | 'cobalt' | 'moss' | 'plum' | 'amber' | 'ink';
export type Size = 'sm' | 'md' | 'lg';

export interface Prefs {
  theme: Theme;
  accent: Accent;
  size: Size;
  /** Default tab on Home. */
  homeTab: 'foryou' | 'following' | 'whispers';
  sendOnEnter: boolean;
}

const KEY = 'wt:prefs';
const ACCENTS = ['vermilion', 'cobalt', 'moss', 'plum', 'amber', 'ink'];
const defaults: Prefs = { theme: 'system', accent: 'vermilion', size: 'md', homeTab: 'foryou', sendOnEnter: true };

let state: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    const p = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as Prefs;
    if (!ACCENTS.includes(p.accent)) p.accent = 'vermilion';
    return p;
  } catch {
    return defaults;
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function apply() {
  const root = document.documentElement;
  const theme = state.theme === 'system' ? (media?.matches ? 'dark' : 'light') : state.theme;
  root.dataset.theme = theme;
  root.dataset.accent = state.accent;
  root.dataset.size = state.size;
  const bg = getComputedStyle(root).getPropertyValue('--wt-bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#ffffff');
}

media?.addEventListener('change', () => state.theme === 'system' && apply());
if (typeof document !== 'undefined') apply();

export function setPrefs(patch: Partial<Prefs>) {
  state = { ...state, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
  apply();
  listeners.forEach((l) => l());
}

export function getPrefs() {
  return state;
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
