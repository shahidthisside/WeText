import { Bell, Compass, Home, LogOut, MessageCircle, PenLine, Search, Settings, Sparkles, User, Bookmark, CircleHelp, type LucideIcon } from 'lucide-react';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { setMe, useAuthedMe, useCounts } from '../lib/auth';
import { closeComposer, openComposer, useComposerState } from '../lib/composer';
import { openHelp, openPalette } from '../lib/palette';
import { queryClient } from '../lib/query';
import { useRealtime } from '../lib/realtime';
import { disconnectSocket } from '../lib/socket';
import { cn } from '../lib/utils';
import { CommandPalette } from './CommandPalette';
import { HelpSheet } from './HelpSheet';
import { Composer } from './Composer';
import { ShareToChat } from './chat/ShareToChat';
import { Avatar, Logo, Menu, MenuContent, MenuItem, MenuTrigger, Modal, PageSpinner } from './ui';

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  disconnectSocket();
  queryClient.clear();
  setMe(null);
}

function Count({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[0.625rem] font-bold leading-[18px] text-on-accent ring-2 ring-card">
      {n > 99 ? '99+' : n}
    </span>
  );
}

interface DockItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

/**
 * Floating dock: the primary navigation on every screen size.
 * A single pill slides between items (measured from the DOM), so switching
 * pages animates instead of snapping.
 */
function Dock({ items }: { items: DockItem[] }) {
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number; visible: boolean }>({ left: 0, width: 0, visible: false });
  const activeIdx = items.findIndex((it) => pathname === it.to || pathname.startsWith(it.to + '/'));

  const measure = useCallback(() => {
    const el = activeIdx >= 0 ? refs.current[activeIdx] : null;
    if (!el) return setPill((p) => (p.visible ? { ...p, visible: false } : p));
    setPill({ left: el.offsetLeft, width: el.offsetWidth, visible: true });
  }, [activeIdx]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (nav.current) ro.observe(nav.current);
    return () => ro.disconnect();
  }, [measure, items.length]);

  return (
    <nav
      ref={nav}
      aria-label="Primary"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100vw-1rem)] max-w-[460px] -translate-x-1/2 sm:w-max sm:max-w-[calc(100vw-1rem)] items-center gap-0.5 rounded-[30px] border border-line-strong bg-card p-1.5 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.4)] animate-rise sm:bottom-5 sm:gap-1 sm:rounded-full"
    >
      {/* sliding active pill */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-1.5 top-1.5 rounded-[22px] bg-fg sm:rounded-full',
          'transition-[left,width,opacity] duration-[380ms] ease-[cubic-bezier(0.3,1.2,0.4,1)]',
          pill.visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{ left: pill.left, width: pill.width }}
      />
      {items.map((it, i) => {
        const active = i === activeIdx;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={it.label}
            className={cn(
              'group relative z-10 flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] px-0.5 transition-colors duration-300 active:scale-95 sm:h-12 sm:flex-none sm:flex-row sm:gap-2 sm:rounded-full sm:px-4',
              active ? 'text-bg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span className="relative">
              <it.icon key={active ? 'on' : 'off'} className={cn('size-[21px] transition-transform duration-300 group-hover:-translate-y-0.5', active && 'animate-pop')} strokeWidth={active ? 2.4 : 1.9} />
              <Count n={it.badge} />
            </span>
            <span className="text-[11px] font-semibold leading-none sm:text-[0.875rem]">{it.label}</span>
          </NavLink>
        );
      })}
      <button
        onClick={() => openComposer()}
        aria-label="Write"
        className="group relative z-10 ml-1 flex h-[52px] w-[54px] shrink-0 flex-col max-[360px]:w-[48px] items-center justify-center gap-0.5 rounded-[22px] bg-accent text-on-accent shadow-[0_8px_20px_-8px_var(--wt-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_var(--wt-accent)] active:translate-y-0 active:scale-95 sm:h-12 sm:w-auto sm:flex-row sm:gap-2 sm:rounded-full sm:px-5"
      >
        <PenLine className="size-5 transition-transform duration-300 group-hover:-rotate-12" />
        <span className="text-[11px] font-semibold leading-none sm:text-[0.875rem]">Write</span>
      </button>
    </nav>
  );
}

function TopBar() {
  const me = useAuthedMe();
  const counts = useCounts();
  const navigate = useNavigate();
  const activity = (counts.data?.notifications ?? 0) + (counts.data?.followRequests ?? 0);
  return (
    <header className="glass sticky top-0 z-30 border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        <NavLink to="/home" aria-label="WeText home" className="shrink-0">
          <Logo wordmark className="text-[1rem]" />
        </NavLink>
        <button
          onClick={openPalette}
          className="mx-auto hidden h-10 w-full max-w-[420px] items-center gap-3 rounded-full border border-line bg-card px-4 text-[0.875rem] text-fg-subtle transition-colors hover:border-line-strong md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search people, tags, notes…</span>
          <kbd className="rounded-md border border-line bg-bg-muted px-1.5 font-sans text-[0.6875rem] font-semibold text-fg-muted">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button onClick={openPalette} aria-label="Search" className="flex size-10 items-center justify-center rounded-full hover:bg-bg-hover md:hidden">
            <Search className="size-5" />
          </button>
          <button onClick={openHelp} aria-label="Help: how WeText works" title="Help: how WeText works" className="flex size-10 items-center justify-center rounded-full text-fg-muted hover:bg-bg-hover hover:text-fg">
            <CircleHelp className="size-5" />
          </button>
          <NavLink to="/activity" aria-label="Activity" className={({ isActive }) => cn('relative flex size-10 items-center justify-center rounded-full hover:bg-bg-hover', isActive && 'bg-bg-hover')}>
            <Bell className="size-5" />
            <Count n={activity} />
          </NavLink>
          <Menu>
            <MenuTrigger asChild>
              <button className="ml-1 rounded-[14px] transition-transform hover:scale-105" aria-label="Account menu">
                <Avatar user={me} size={36} />
              </button>
            </MenuTrigger>
            <MenuContent>
              <div className="px-3 py-2">
                <p className="font-display font-bold">{me.displayName}</p>
                <p className="text-[0.8125rem] text-fg-muted">@{me.username}</p>
              </div>
              <MenuItem icon={<User />} onSelect={() => navigate(`/${me.username}`)}>
                Your profile
              </MenuItem>
              <MenuItem icon={<Bookmark />} onSelect={() => navigate('/saved')}>
                Saved
              </MenuItem>
              <MenuItem icon={<Settings />} onSelect={() => navigate('/settings')}>
                Settings
              </MenuItem>
              <MenuItem icon={<CircleHelp />} onSelect={openHelp}>
                Help: how it works
              </MenuItem>
              <MenuItem
                icon={<LogOut />}
                onSelect={async () => {
                  await logout();
                  navigate('/');
                  toast('Signed out. See you soon.');
                }}
              >
                Log out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </header>
  );
}

export function AppLayout() {
  const me = useAuthedMe();
  const counts = useCounts();
  const location = useLocation();
  useRealtime();
  const c = counts.data;
  const items: DockItem[] = [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/discover', label: 'Discover', icon: Compass },
    { to: '/connect', label: 'Connect', icon: Sparkles },
    { to: '/chats', label: 'Chats', icon: MessageCircle, badge: (c?.messages ?? 0) + (c?.messageRequests ?? 0) },
    { to: `/${me.username}`, label: 'You', icon: User },
  ];
  const inChatThread = /^\/chats\/[^/]+/.test(location.pathname);
  // Keep the unread count in the browser tab title, composing with whatever
  // per-page title general_web has set. We only prefix "(n) ".
  const totalUnread = (c?.messages ?? 0) + (c?.messageRequests ?? 0) + (c?.notifications ?? 0) + (c?.followRequests ?? 0);
  useDocumentTitleBadge(totalUnread);
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className={cn('mx-auto w-full max-w-[1180px] px-4 sm:px-6', inChatThread ? 'pb-4' : 'pb-32')}>
        <Suspense fallback={<PageSpinner />}>
          <div key={location.pathname.split('/')[1]} className="animate-rise">
            <Outlet />
          </div>
        </Suspense>
      </main>
      {/* The dock stays visible everywhere. On phones a full-screen thread
          overlay (Messages.tsx) sits above it, covering it as required. */}
      <Dock items={items} />
      <ComposerModal />
      <ShareToChat />
      <CommandPalette />
      <HelpSheet />
    </div>
  );
}

/**
 * Prefixes the browser tab title with "(n) " when there are unread items,
 * composing with whatever title the active page set. No MutationObserver: we
 * strip any existing "(n) " prefix and re-apply, re-running whenever `n`
 * changes or the route (hence the title) changes.
 */
/**
 * Prefixes the browser tab title with "(n) " when there are unread items,
 * composing with whatever title the active page set via `useDocumentTitle`.
 *
 * Effect-ordering between this layout and the child page is fragile (a page's
 * `useDocumentTitle` effect can run after ours and clobber the prefix), so we
 * watch the <title> element and re-apply the prefix whenever it changes. The
 * observer ignores our own writes via a guard flag.
 */
function useDocumentTitleBadge(n: number) {
  useEffect(() => {
    const titleEl = document.querySelector('title');
    if (!titleEl) return;
    let selfWrite = false;
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s+/, '');
      const next = n > 0 ? `(${n}) ${base}` : base;
      if (next === document.title) return;
      selfWrite = true;
      document.title = next;
    };
    const obs = new MutationObserver(() => {
      if (selfWrite) {
        selfWrite = false;
        return;
      }
      apply();
    });
    obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
    apply();
    return () => obs.disconnect();
  }, [n]);
}

function ComposerModal() {
  const s = useComposerState();
  const title = s.edit ? 'Edit note' : s.replyTo ? 'Reply' : s.quote ? 'Quote' : s.prompt ? 'Today’s prompt' : 'Write';
  return (
    <Modal open={s.open} onOpenChange={(o) => !o && closeComposer()} title={title} wide>
      {s.open && (
        <div className="pb-3">
          <Composer
            key={`${s.replyTo?.id}-${s.quote?.id}-${s.edit?.id}-${s.prompt?.key}-${s.whisper}`}
            replyTo={s.replyTo}
            quote={s.quote}
            edit={s.edit}
            prompt={s.prompt}
            startWhisper={s.whisper}
            autoFocus
            onDone={() => closeComposer()}
          />
        </div>
      )}
    </Modal>
  );
}
