import { useMutation, useQuery } from '@tanstack/react-query';
import { Ban, ChevronRight, KeyRound, Laptop, LogOut, Monitor, Palette, Shield, Smartphone, Trash2, User } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { logout } from '../components/Layout';
import { Avatar, Button, ConfirmDialog, IconButton, PageHeader, PageSpinner, Radio, Switch, TextInput } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { setMe, useAuthedMe } from '../lib/auth';
import { setPrefs, usePrefs, type Accent, type Size, type Theme } from '../lib/prefs';
import { queryClient } from '../lib/query';
import type { Me, UserSummary } from '../lib/types';
import { cn, shortTime } from '../lib/utils';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Download } from 'lucide-react';

type Section = 'account' | 'privacy' | 'display' | 'security' | 'blocked';

const SECTIONS: { key: Section; label: string; desc: string; icon: typeof User }[] = [
  { key: 'account', label: 'Your account', desc: 'Username, email and account deletion', icon: User },
  { key: 'privacy', label: 'Privacy and safety', desc: 'Who can see your posts and message you', icon: Shield },
  { key: 'display', label: 'Display', desc: 'Theme, signal colour and text size', icon: Palette },
  { key: 'security', label: 'Security and sessions', desc: 'Password and logged-in devices', icon: KeyRound },
  { key: 'blocked', label: 'Muted and blocked', desc: 'Manage accounts you’ve muted or blocked', icon: Ban },
];

export default function Settings() {
  const { section } = useParams<{ section?: Section }>();
  useDocumentTitle(section ? `Settings · ${SECTIONS.find((s) => s.key === section)?.label ?? ''}` : 'Settings');
  const active = SECTIONS.find((s) => s.key === section) ?? (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? SECTIONS[2] : undefined);
  return (
    <div className="mx-auto max-w-[1020px]">
      <PageHeader back={!!section} backOnlyMobile eyebrow="Settings" title={active && section ? active.label : 'Make it yours'} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
        <nav className={cn('min-w-0 space-y-1', section && 'max-md:hidden')} aria-label="Settings">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              to={`/settings/${s.key}`}
              className={cn('flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors', active?.key === s.key ? 'bg-fg text-bg' : 'hover:bg-bg-hover')}
            >
              <s.icon className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">{s.label}</span>
                <span className={cn('block truncate text-[0.75rem]', active?.key === s.key ? 'text-bg/60' : 'text-fg-muted')}>{s.desc}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 opacity-50 md:hidden" />
            </Link>
          ))}
        </nav>
        <section className={cn('min-w-0', !section && 'max-md:hidden')}>
          {active?.key === 'account' && <AccountSettings />}
          {active?.key === 'privacy' && <PrivacySettings />}
          {active?.key === 'display' && <DisplaySettings />}
          {active?.key === 'security' && <SecuritySettings />}
          {active?.key === 'blocked' && <BlockedSettings />}
        </section>
      </div>
    </div>
  );
}

function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="mb-4 rounded-[var(--radius-card)] border border-line bg-card p-2 shadow-paper">
      {title && <h2 className="px-3 pb-1 pt-3 text-[1.25rem] font-bold">{title}</h2>}
      {children}
      {footer && <p className="px-3 pb-3 pt-1 text-[0.8125rem] text-fg-muted">{footer}</p>}
    </section>
  );
}

/* ---------------------------------------------------------------- Account */

function AccountSettings() {
  const me = useAuthedMe();
  const navigate = useNavigate();
  const [username, setUsername] = useState(me.username);
  const [email, setEmail] = useState(me.email);
  const [emailPw, setEmailPw] = useState('');
  const [delPw, setDelPw] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const saveUsername = useMutation({
    mutationFn: () => api.post<{ user: Me }>('/me/username', { username }),
    onSuccess: (r) => {
      setMe(r.user);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast('Username updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveEmail = useMutation({
    mutationFn: () => api.post('/auth/email', { email, password: emailPw }),
    onSuccess: () => {
      setMe({ ...me, email: email.trim().toLowerCase() });
      setEmailPw('');
      toast('Email updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.post('/auth/delete-account', { password: delPw }),
    onSuccess: async () => {
      await logout();
      navigate('/');
      toast('Your account has been deleted');
    },
    onError: (e) => {
      setConfirmDel(false);
      toast.error(errorMessage(e));
    },
  });

  return (
    <>
      <Group title="Username" footer="Your profile URL changes with your username. Old links won’t redirect.">
        <form
          className="flex items-start gap-3 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveUsername.mutate();
          }}
        >
          <TextInput label="Username" className="flex-1" value={username} counter={20} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
          <Button type="submit" className="mt-3" loading={saveUsername.isPending} disabled={username === me.username || username.length < 3}>
            Save
          </Button>
        </form>
      </Group>
      <Group title="Email">
        <form
          className="space-y-3 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveEmail.mutate();
          }}
        >
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {email.trim().toLowerCase() !== me.email && (
            <>
              <TextInput label="Confirm with your password" type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} autoComplete="current-password" />
              <Button type="submit" loading={saveEmail.isPending} disabled={!emailPw}>
                Update email
              </Button>
            </>
          )}
        </form>
      </Group>
      <Group title="Your data" footer="Download a copy of your account: your profile, posts, messages and more, as JSON.">
        <div className="px-4 py-2">
          <DownloadData />
        </div>
      </Group>
      <Group title="Delete account" footer="This permanently deletes your profile, posts, likes, messages and everything else. It can’t be undone.">
        <div className="space-y-3 px-4 py-2">
          <TextInput label="Password" type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" />
          <Button variant="danger" disabled={!delPw} onClick={() => setConfirmDel(true)}>
            <Trash2 className="size-4" /> Delete my account
          </Button>
        </div>
      </Group>
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete your account?"
        body={`@${me.username} and all of its content will be permanently removed.`}
        confirmLabel="Delete forever"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Download data */

function DownloadData() {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch('/api/me/export', { credentials: 'same-origin' });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Data export isn’t available yet. Please try again later.');
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wetext-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Your data is downloading');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" onClick={download} loading={busy}>
      <Download className="size-4" /> Download my data
    </Button>
  );
}

/* ---------------------------------------------------------------- Privacy */

function PrivacySettings() {
  const me = useAuthedMe();
  async function update(patch: Partial<Pick<Me, 'isPrivate' | 'dmPolicy' | 'showOnline'>>) {
    const prev = me;
    setMe({ ...me, ...patch });
    try {
      const r = await api.patch<{ user: Me }>('/me', patch);
      setMe(r.user);
      queryClient.invalidateQueries({ queryKey: ['profile', me.username.toLowerCase()] });
    } catch (e) {
      setMe(prev);
      toast.error(errorMessage(e));
    }
  }
  return (
    <>
      <Group title="Audience">
        <Switch
          label="Private account"
          checked={me.isPrivate}
          onChange={(v) => update({ isPrivate: v })}
          description="Only people you approve can see your posts, followers and following. Your anonymous posts stay public either way — nobody can tell they’re yours."
        />
      </Group>
      <Group title="Direct messages" footer="People you’ve already been talking to can always reply.">
        {(
          [
            ['everyone', 'Everyone', 'Messages from people you don’t follow go to Requests'],
            ['following', 'People you follow', 'Only accounts you follow can start a conversation'],
            ['nobody', 'No one', 'Nobody can start a new conversation with you'],
          ] as const
        ).map(([v, label, desc]) => (
          <Radio key={v} label={label} description={desc} checked={me.dmPolicy === v} onChange={() => update({ dmPolicy: v })} />
        ))}
      </Group>
      <Group title="Activity status">
        <Switch
          label="Show when you’re online"
          checked={me.showOnline}
          onChange={(v) => update({ showOnline: v })}
          description="People can see a green dot when you’re active and when you were last online. Turn this off to hide your activity."
        />
      </Group>
    </>
  );
}

/* ---------------------------------------------------------------- Display */

const ACCENTS: { v: Accent; c: string; label: string }[] = [
  { v: 'vermilion', c: '#ec5b2f', label: 'Vermilion' },
  { v: 'cobalt', c: '#3d5be0', label: 'Cobalt' },
  { v: 'moss', c: '#4d8a4f', label: 'Moss' },
  { v: 'plum', c: '#9a4a8c', label: 'Plum' },
  { v: 'amber', c: '#d18b12', label: 'Amber' },
  { v: 'ink', c: 'var(--wt-ink)', label: 'Ink' },
];

function DisplaySettings() {
  const prefs = usePrefs();
  const themes: { v: Theme; label: string; bg: string; fg: string; icon?: ReactNode }[] = [
    { v: 'light', label: 'Paper', bg: '#f3efe7', fg: '#1c1915' },
    { v: 'dim', label: 'Dusk', bg: '#1f1c1a', fg: '#f1ebe1' },
    { v: 'dark', label: 'Ink', bg: '#0f0e0d', fg: '#ece7de' },
    { v: 'system', label: 'Match device', bg: 'linear-gradient(135deg,#f3efe7 50%,#0f0e0d 50%)', fg: '#888', icon: <Monitor className="size-4" /> },
  ];
  const sizes: { v: Size; label: string; px: string }[] = [
    { v: 'sm', label: 'Small', px: '14px' },
    { v: 'md', label: 'Default', px: '15px' },
    { v: 'lg', label: 'Large', px: '17px' },
  ];
  return (
    <>
      <div className="p-4">
        <div className="flex gap-3 rounded-[22px] border border-line bg-card p-4 shadow-paper">
          <Avatar user={{ displayName: 'WeText', username: 'wetext', avatarUrl: null }} size={40} />
          <div className="min-w-0 flex-1 text-[0.9375rem]">
            <p>
              <b className="font-display">WeText</b> <span className="text-fg-muted">@wetext · 2m</span>
            </p>
            <p className="mt-1 font-display text-[1.25rem] font-semibold leading-tight tracking-tight">
              This is how notes look with your settings. <span className="text-accent">#yourvibe</span>
            </p>
          </div>
        </div>
      </div>
      <Group title="Font size">
        <div className="flex items-center gap-4 px-4 py-4">
          <span className="text-[13px]">Aa</span>
          <div className="flex flex-1 justify-between">
            {sizes.map((s) => (
              <button
                key={s.v}
                onClick={() => setPrefs({ size: s.v })}
                aria-label={s.label}
                aria-pressed={prefs.size === s.v}
                className={cn('flex min-w-14 flex-col items-center gap-1 py-1 text-[0.75rem] text-fg-muted', prefs.size === s.v && 'font-bold text-accent')}
              >
                <span className={cn('size-5 rounded-full border-2', prefs.size === s.v ? 'border-accent bg-accent' : 'border-line-strong bg-bg')} />
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-[20px]">Aa</span>
        </div>
      </Group>
      <Group title="Colour">
        <div className="flex flex-wrap justify-around gap-3 px-4 py-4">
          {ACCENTS.map((a) => (
            <button
              key={a.v}
              onClick={() => setPrefs({ accent: a.v })}
              aria-label={a.label}
              aria-pressed={prefs.accent === a.v}
              className="flex size-11 items-center justify-center rounded-full transition-transform hover:scale-110"
              style={{ background: a.c }}
            >
              {prefs.accent === a.v && (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke={a.v === 'ink' ? 'var(--wt-bg)' : '#fff'} strokeWidth="3">
                  <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </Group>
      <Group title="Background">
        <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
          {themes.map((t) => (
            <button
              key={t.v}
              onClick={() => setPrefs({ theme: t.v })}
              aria-pressed={prefs.theme === t.v}
              className={cn('flex h-16 items-center gap-3 rounded-md border-2 px-4 text-left font-bold', prefs.theme === t.v ? 'border-accent' : 'border-line')}
              style={{ background: t.bg, color: t.fg }}
            >
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', prefs.theme === t.v ? 'border-accent bg-accent' : 'border-current opacity-60')} />
              <span className={cn('text-[0.875rem]', t.v === 'system' && 'rounded bg-bg px-1 text-fg')}>{t.label}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Messages">
        <Switch label="Press Enter to send" checked={prefs.sendOnEnter} onChange={(v) => setPrefs({ sendOnEnter: v })} description="When off, use Ctrl/⌘ + Enter to send and Enter for a new line." />
      </Group>
    </>
  );
}

/* ---------------------------------------------------------------- Security */

interface SessionRow {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: number;
  lastUsedAt: number;
  current: boolean;
}

function describeAgent(ua: string) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { label: `${browser} on ${os}`, mobile: /iPhone|Android|Mobile/.test(ua) };
}

function SecuritySettings() {
  const navigate = useNavigate();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<{ sessions: SessionRow[] }>('/auth/sessions') });

  const changePw = useMutation({
    mutationFn: () => api.post('/auth/password', { currentPassword: cur, newPassword: next }),
    onSuccess: () => {
      setCur('');
      setNext('');
      setConfirmPw('');
      setPwErr(null);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast('Password changed. Other sessions were signed out.');
    },
    onError: (e) => setPwErr(e instanceof ApiError ? e.message : errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/auth/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast('Session signed out');
    },
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.post<{ revoked: number }>('/auth/sessions/revoke-others'),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast(r.revoked ? `Signed out of ${r.revoked} other session${r.revoked === 1 ? '' : 's'}` : 'No other sessions');
    },
  });

  const mismatch = !!confirmPw && confirmPw !== next;
  return (
    <>
      <Group title="Change password">
        <form
          className="space-y-3 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) changePw.mutate();
          }}
        >
          <TextInput label="Current password" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          <TextInput label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="At least 8 characters with a letter and a number" />
          <TextInput label="Confirm new password" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" error={mismatch ? 'Passwords don’t match' : null} />
          {pwErr && <p className="text-[0.875rem] text-danger">{pwErr}</p>}
          <Button type="submit" loading={changePw.isPending} disabled={!cur || !next || mismatch || !confirmPw}>
            Change password
          </Button>
        </form>
      </Group>
      <Group title="Sessions" footer="These are the devices currently signed in to your account.">
        {sessions.isPending ? (
          <PageSpinner />
        ) : (
          sessions.data?.sessions.map((s) => {
            const d = describeAgent(s.userAgent);
            return (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-bg-muted">{d.mobile ? <Smartphone className="size-5" /> : <Laptop className="size-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem]">
                    {d.label} {s.current && <span className="ml-1 rounded bg-accent-soft px-1.5 text-[0.75rem] font-bold text-accent">This device</span>}
                  </p>
                  <p className="text-[0.8125rem] text-fg-muted">
                    {s.ip} · Active {shortTime(s.lastUsedAt)} · Signed in {shortTime(s.createdAt)}
                  </p>
                </div>
                {s.current ? (
                  <IconButton
                    label="Log out"
                    onClick={async () => {
                      await logout();
                      navigate('/');
                    }}
                  >
                    <LogOut className="size-5" />
                  </IconButton>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => revoke.mutate(s.id)}>
                    Sign out
                  </Button>
                )}
              </div>
            );
          })
        )}
        {(sessions.data?.sessions.length ?? 0) > 1 && (
          <div className="px-4 py-2">
            <Button variant="outline" className="text-danger" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}>
              Sign out of all other sessions
            </Button>
          </div>
        )}
      </Group>
    </>
  );
}

/* ---------------------------------------------------------------- Blocks */

function BlockedSettings() {
  const blocks = useQuery({ queryKey: ['blocks'], queryFn: () => api.get<{ users: UserSummary[] }>('/me/blocks') });
  const mutes = useQuery({ queryKey: ['mutes'], queryFn: () => api.get<{ users: UserSummary[] }>('/me/mutes') });

  async function undo(kind: 'block' | 'mute', u: UserSummary) {
    try {
      await api.del(`/users/${u.username}/${kind}`);
      queryClient.invalidateQueries({ queryKey: [kind === 'block' ? 'blocks' : 'mutes'] });
      queryClient.invalidateQueries({ queryKey: ['profile', u.username.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast(kind === 'block' ? `Unblocked @${u.username}` : `Unmuted @${u.username}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const list = (users: UserSummary[] | undefined, kind: 'block' | 'mute') =>
    !users ? (
      <PageSpinner />
    ) : !users.length ? (
      <p className="px-4 py-4 text-[0.9375rem] text-fg-muted">{kind === 'block' ? 'You haven’t blocked anyone.' : 'You haven’t muted anyone.'}</p>
    ) : (
      users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 px-4 py-3">
          <Link to={`/${u.username}`}>
            <Avatar user={u} size={40} />
          </Link>
          <Link to={`/${u.username}`} className="min-w-0 flex-1 leading-5">
            <p className="truncate font-bold">{u.displayName}</p>
            <p className="truncate text-fg-muted">@{u.username}</p>
          </Link>
          <Button size="sm" variant={kind === 'block' ? 'danger' : 'outline'} onClick={() => undo(kind, u)}>
            {kind === 'block' ? 'Unblock' : 'Unmute'}
          </Button>
        </div>
      ))
    );

  return (
    <>
      <Group title="Blocked accounts" footer="Blocked accounts can’t follow you, see your posts or message you.">
        {list(blocks.data?.users, 'block')}
      </Group>
      <Group title="Muted accounts" footer="You won’t see posts from muted accounts in your timelines or get notifications from them. They aren’t told.">
        {list(mutes.data?.users, 'mute')}
      </Group>
    </>
  );
}

