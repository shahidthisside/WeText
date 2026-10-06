import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Bell, Bookmark, CircleHelp, Compass, CornerDownLeft, Hash, Home, MessageCircle, Moon, PenLine, Search, Settings, Sparkles, User, VenetianMask } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useAuthedMe } from '../lib/auth';
import { openComposer } from '../lib/composer';
import { closePalette, openHelp, togglePalette, usePaletteOpen } from '../lib/palette';
import { setPrefs } from '../lib/prefs';
import type { UserCard } from '../lib/types';
import { cn } from '../lib/utils';
import { Avatar } from './ui';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
  group: string;
}

/** ⌘K / Ctrl+K: jump anywhere, find people and tags, or start writing. */
export function CommandPalette() {
  const open = usePaletteOpen();
  const me = useAuthedMe();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const term = q.trim();
  const people = useQuery({
    queryKey: ['palette-people', term],
    queryFn: () => api.get<{ users: UserCard[] }>(`/search?q=${encodeURIComponent(term)}&type=people`),
    enabled: open && term.length > 0,
    staleTime: 30_000,
  });

  const go = (to: string) => () => navigate(to);
  const cmds = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = [
      { id: 'home', label: 'Home', icon: <Home />, run: go('/home'), group: 'Go to' },
      { id: 'discover', label: 'Discover', icon: <Compass />, run: go('/discover'), group: 'Go to' },
      { id: 'connect', label: 'Connect', hint: 'Find your people', icon: <Sparkles />, run: go('/connect'), group: 'Go to' },
      { id: 'chats', label: 'Chats', icon: <MessageCircle />, run: go('/chats'), group: 'Go to' },
      { id: 'activity', label: 'Activity', icon: <Bell />, run: go('/activity'), group: 'Go to' },
      { id: 'saved', label: 'Saved', icon: <Bookmark />, run: go('/saved'), group: 'Go to' },
      { id: 'profile', label: 'Your profile', icon: <User />, run: go(`/${me.username}`), group: 'Go to' },
      { id: 'settings', label: 'Settings', icon: <Settings />, run: go('/settings'), group: 'Go to' },
      { id: 'help', label: 'How WeText works', hint: 'Help', icon: <CircleHelp />, run: openHelp, group: 'Actions' },
      { id: 'write', label: 'Write a note', icon: <PenLine />, run: () => openComposer(), group: 'Actions' },
      { id: 'whisper', label: 'Write a whisper', hint: 'Anonymous', icon: <VenetianMask />, run: () => openComposer({ whisper: true }), group: 'Actions' },
      {
        id: 'theme',
        label: 'Toggle dark mode',
        icon: <Moon />,
        run: () => setPrefs({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }),
        group: 'Actions',
      },
    ];
    const t = term.toLowerCase();
    const filtered = t ? nav.filter((c) => c.label.toLowerCase().includes(t)) : nav;
    const extra: Cmd[] = [];
    if (t) {
      const tag = t.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '');
      if (tag) extra.push({ id: 'tag', label: `#${tag}`, hint: 'Open tag', icon: <Hash />, run: go(`/tag/${tag}`), group: 'Search' });
      extra.push({ id: 'search', label: `Search notes for “${term}”`, icon: <Search />, run: go(`/discover?q=${encodeURIComponent(term)}`), group: 'Search' });
    }
    const ppl: Cmd[] = (people.data?.users ?? []).slice(0, 5).map((u) => ({
      id: `u-${u.id}`,
      label: u.displayName,
      hint: `@${u.username}`,
      icon: <Avatar user={u} size={24} />,
      run: go(`/${u.username}`),
      group: 'People',
    }));
    return [...ppl, ...extra, ...filtered];
  }, [term, people.data, me.username]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setIdx(0), [term]);

  function run(c: Cmd | undefined) {
    if (!c) return;
    closePalette();
    c.run();
  }

  let lastGroup = '';
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && closePalette()}>
      <Dialog.Portal>
        <Dialog.Overlay className="backdrop fixed inset-0 z-[80] animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[80] w-[calc(100%-1.5rem)] max-w-[580px] -translate-x-1/2 overflow-hidden rounded-[26px] border border-line bg-card shadow-2xl outline-none animate-sheet"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="size-5 text-fg-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, #tags, or jump to…"
              aria-label="Command search"
              className="h-14 min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-fg-subtle"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setIdx((i) => Math.min(i + 1, cmds.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  run(cmds[idx]);
                }
              }}
            />
            <kbd className="rounded-md border border-line bg-bg-muted px-1.5 text-[0.6875rem] font-semibold text-fg-muted">esc</kbd>
          </div>
          <div className="max-h-[56vh] overflow-y-auto p-2" role="listbox">
            {cmds.length === 0 && <p className="px-3 py-8 text-center text-[0.9375rem] text-fg-muted">Nothing matches “{term}”</p>}
            {cmds.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {header && <p className="px-3 pb-1 pt-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-fg-subtle">{header}</p>}
                  <button
                    role="option"
                    aria-selected={i === idx}
                    onMouseMove={() => setIdx(i)}
                    onClick={() => run(c)}
                    className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left', i === idx && 'bg-bg-hover')}
                  >
                    <span className="flex size-8 items-center justify-center rounded-xl bg-bg-muted text-fg-muted [&>svg]:size-4">{c.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                    {c.hint && <span className="truncate text-[0.8125rem] text-fg-subtle">{c.hint}</span>}
                    {i === idx && <CornerDownLeft className="size-4 text-fg-subtle" />}
                  </button>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
