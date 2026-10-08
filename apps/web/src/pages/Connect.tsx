import { useQuery } from '@tanstack/react-query';
import { MapPin, MessageCircle, RotateCcw, SlidersHorizontal, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { InterestPicker, TraitSliders } from '../components/ProfileFields';
import { ScoreRing, VibeBars } from '../components/VibeCheck';
import { Avatar, Button, EmptyState, ErrorState, IconButton, Modal, PageHeader, PageSpinner, Tabs } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { setMe, useAuthedMe } from '../lib/auth';
import { setFlag } from '../lib/flags';
import { queryClient } from '../lib/query';
import type { FollowState, Match, Me } from '../lib/types';
import { cn, lastSeen } from '../lib/utils';
import { InviteButton } from '../components/Invite';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function DeckCard({ m, onPass, onFollow, onHi }: { m: Match; onPass: () => void; onFollow: () => void; onHi: () => void }) {
  const u = m.user;
  const status = u.isOnline ? 'Online now' : lastSeen(u.lastSeenAt);
  return (
    <article className="relative overflow-hidden rounded-[32px] border border-line bg-card shadow-[0_30px_60px_-30px_rgb(0_0_0/0.4)]" aria-label={`Suggested: ${u.displayName}`}>
      <div className="relative h-20 overflow-hidden bg-accent-soft">
        <div aria-hidden className="absolute -bottom-8 right-12 size-32 rounded-full bg-accent/20" />
        <div aria-hidden className="absolute -bottom-14 right-0 size-32 rounded-full bg-accent/15" />
      </div>
      <div className="px-6 pb-6 sm:px-8">
        <div className="-mt-10 flex items-end justify-between">
          <Link to={`/${u.username}`} className="rounded-[36%] ring-[5px] ring-card">
            <Avatar user={u} size={88} online={u.isOnline} />
          </Link>
          <ScoreRing score={m.score} size={76} />
        </div>
        <Link to={`/${u.username}`} className="mt-4 block">
          <h2 className="text-[1.9rem] font-extrabold leading-tight hover:underline">{u.displayName}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.9375rem] text-fg-muted">
            <span>@{u.username}</span>
            {u.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {u.location}
              </span>
            )}
            {status && <span className={cn('text-[0.8125rem]', u.isOnline && 'font-semibold text-online')}>{status}</span>}
          </p>
        </Link>
        {u.bio && <p className="mt-3 text-[1.0625rem] leading-relaxed">{u.bio}</p>}

        {m.sharedInterests.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-fg-subtle">You both like</p>
            <div className="flex flex-wrap gap-1.5">
              {m.sharedInterests.map((i) => (
                <span key={i} className="rounded-full bg-accent-soft px-3 py-1 text-[0.8125rem] font-semibold text-accent">
                  {i}
                </span>
              ))}
              {u.interests
                .filter((i) => !m.sharedInterests.includes(i))
                .slice(0, 4)
                .map((i) => (
                  <span key={i} className="rounded-full bg-bg-muted px-3 py-1 text-[0.8125rem] font-semibold text-fg-muted">
                    {i}
                  </span>
                ))}
            </div>
          </div>
        )}

        {m.vibe.length > 0 && (
          <div className="mt-4 rounded-2xl bg-bg-muted/70 p-4">
            <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-fg-subtle">Vibe check</p>
            {m.traitHighlights.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {m.traitHighlights.map((h) => (
                  <span key={h} className="rounded-full bg-card px-2.5 py-0.5 text-[0.75rem] font-semibold">
                    {h}
                  </span>
                ))}
              </div>
            )}
            <VibeBars traits={m.vibe} twoCol />
          </div>
        )}

        {m.mutualCount > 0 && (
          <p className="mt-4 flex items-center gap-1.5 text-[0.8125rem] text-fg-muted">
            <Users className="size-3.5" /> {m.mutualCount} {m.mutualCount === 1 ? 'person' : 'people'} you follow {m.mutualCount === 1 ? 'follows' : 'follow'} them
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <IconButton label="Not for me (←)" className="size-12 border border-line-strong" onClick={onPass}>
            <X className="size-5" />
          </IconButton>
          <Button size="lg" variant="outline" className="flex-1" onClick={onHi}>
            <MessageCircle className="size-[18px]" /> Say hi
          </Button>
          <Button size="lg" className="flex-1" onClick={onFollow}>
            <UserPlus className="size-[18px]" /> Follow
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function Connect() {
  const me = useAuthedMe();
  const navigate = useNavigate();
  useDocumentTitle('Connect');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'all' | 'online'>('all');
  const [gone, setGone] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: ['connect'], queryFn: () => api.get<{ matches: Match[]; hidden: number }>('/connect') });
  useEffect(() => setFlag('visited-connect', true), []);

  const queue = (q.data?.matches ?? []).filter((m) => !gone.has(m.user.id) && (tab === 'all' || m.user.isOnline));
  const current = queue[0];
  const dismiss = (id: string) => setGone((g) => new Set(g).add(id));

  const pass = useCallback(
    async (m: Match) => {
      dismiss(m.user.id);
      try {
        await api.post(`/connect/${m.user.id}/pass`);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [],
  );
  const follow = useCallback(
    async (m: Match) => {
      try {
        const r = await api.post<{ status: FollowState }>(`/users/${m.user.username}/follow`);
        toast(r.status === 'pending' ? `Request sent to ${m.user.displayName}` : `Following ${m.user.displayName}`);
        dismiss(m.user.id);
        queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
        queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [],
  );
  async function hi(m: Match) {
    try {
      const r = await api.post<{ conversation: { id: string } }>('/conversations', { username: m.user.username });
      navigate(`/chats/${r.conversation.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function resetPasses() {
    await api.del('/connect/passes');
    setGone(new Set());
    queryClient.invalidateQueries({ queryKey: ['connect'] });
    toast('Hidden people are back');
  }

  // Keyboard: ← pass, → follow
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!current || editing || (e.target as HTMLElement).closest('input,textarea,[role=dialog]')) return;
      if (e.key === 'ArrowLeft') pass(current);
      if (e.key === 'ArrowRight') follow(current);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [current, editing, pass, follow]);

  return (
    <div className="mx-auto max-w-[1020px]">
      <PageHeader
        eyebrow="Connect"
        title="People who get you"
        subtitle="Matched on shared interests and how you’re wired. Follow, say hi, or skip."
        right={
          <>
            <div className="max-sm:hidden">
              <Tabs
              tabs={[
                { value: 'all', label: 'Best matches' },
                { value: 'online', label: 'Online' },
              ]}
              value={tab}
              onChange={setTab}
            />
            </div>
            <IconButton label="Tune your matches" className="border border-line bg-card" onClick={() => setEditing(true)}>
              <SlidersHorizontal className="size-[18px]" />
            </IconButton>
          </>
        }
      >
        <div className="sm:hidden">
          <Tabs
            tabs={[
              { value: 'all', label: 'Best matches' },
              { value: 'online', label: 'Online' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </PageHeader>

      {me.interests.length < 3 && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl bg-accent-soft px-5 py-3">
          <p className="text-[0.9375rem]">Add a few interests for much better matches.</p>
          <Button size="sm" onClick={() => setEditing(true)}>
            Add interests
          </Button>
        </div>
      )}

      {q.isPending ? (
        <PageSpinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !current ? (
        <EmptyState
          title={tab === 'online' ? 'Nobody’s online right now' : (q.data?.hidden ?? 0) > 0 ? 'You’ve met everyone for now' : 'No one to meet yet'}
          body={
            tab === 'online'
              ? 'Check back later, or browse your best matches.'
              : (q.data?.hidden ?? 0) > 0
                ? 'New people join every day. You can also bring back people you hid.'
                : 'WeText is just getting started. As people join, the ones who match your interests and vibe will show up here. Invite a friend to get things going.'
          }
          action={
            tab === 'all' &&
            ((q.data?.hidden ?? 0) > 0 ? (
              <Button variant="outline" onClick={resetPasses}>
                <RotateCcw className="size-4" /> Show hidden people
              </Button>
            ) : (
              <InviteButton />
            ))
          }
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,560px)_1fr]">
          <div className="relative mx-auto w-full max-w-[560px]">
            {queue[2] && <div aria-hidden className="absolute inset-x-8 top-5 h-full rounded-[32px] border border-line bg-card opacity-60" />}
            {queue[1] && <div aria-hidden className="absolute inset-x-4 top-2.5 h-full rounded-[32px] border border-line bg-card opacity-80" />}
            <div key={current.user.id} className="relative animate-rise">
              <DeckCard m={current} onPass={() => pass(current)} onFollow={() => follow(current)} onHi={() => hi(current)} />
            </div>
            <p className="mt-5 hidden text-center text-[0.75rem] text-fg-subtle lg:block">
              <kbd className="rounded border border-line bg-card px-1.5">←</kbd> not for me &nbsp; <kbd className="rounded border border-line bg-card px-1.5">→</kbd> follow
            </p>
          </div>
          <aside className="hidden lg:block">
            <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-fg-subtle">Up next · {queue.length - 1}</p>
            <ul className="space-y-2">
              {queue.slice(1, 7).map((m) => (
                <li key={m.user.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                  <Avatar user={m.user} size={38} online={m.user.isOnline} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-display font-bold">{m.user.displayName}</p>
                    <p className="truncate text-[0.75rem] text-fg-muted">{m.sharedInterests.slice(0, 2).join(' · ') || `@${m.user.username}`}</p>
                  </div>
                  <span className="font-display text-[1rem] font-extrabold tabular-nums text-accent">{m.score}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {editing && <TuneModal me={me} onClose={() => setEditing(false)} />}
    </div>
  );
}

function TuneModal({ me, onClose }: { me: Me; onClose: () => void }) {
  const [interests, setInterests] = useState(me.interests);
  const [traits, setTraits] = useState<Record<string, number>>(me.traits);
  const [tab, setTab] = useState<'interests' | 'vibe'>('interests');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await api.patch<{ user: Me }>('/me', { interests, traits });
      setMe(r.user);
      queryClient.invalidateQueries({ queryKey: ['connect'] });
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'foryou'] });
      onClose();
      toast('Matches updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Tune your matches"
      headerRight={
        <Button size="sm" variant="inverse" onClick={save} loading={busy}>
          Save
        </Button>
      }
    >
      <div className="border-b border-line">
        <Tabs
          tabs={[
            { value: 'interests', label: `Interests (${interests.length})` },
            { value: 'vibe', label: 'Vibe' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="p-5">{tab === 'interests' ? <InterestPicker value={interests} onChange={setInterests} /> : <TraitSliders value={traits} onChange={setTraits} />}</div>
    </Modal>
  );
}
