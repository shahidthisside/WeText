import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, PenLine, VenetianMask } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { InfiniteFeed } from '../components/Feed';
import { LiveFeed } from '../components/LiveFeed';
import { GETTING_STARTED_DISMISSED, GettingStarted } from '../components/GettingStarted';
import { TrendingList, useTrending } from '../components/Sidebar';
import { useFlag } from '../lib/flags';
import { Avatar, Button, EmptyState, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useAuthedMe } from '../lib/auth';
import { openComposer } from '../lib/composer';
import { MOODS } from '../lib/moods';
import { setPrefs, usePrefs } from '../lib/prefs';
import type { DailyPrompt } from '../lib/types';
import { cn } from '../lib/utils';
import { InviteButton } from '../components/Invite';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Tab = 'foryou' | 'following' | 'whispers';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function PromptCard() {
  const q = useQuery({ queryKey: ['prompt'], queryFn: () => api.get<{ prompt: DailyPrompt }>('/feed/prompt'), staleTime: 60_000 });
  const p = q.data?.prompt;
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-line bg-card p-6 shadow-paper sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-accent-soft" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 right-16 size-32 rounded-full bg-accent-soft opacity-60" />
      <p className="relative text-[0.75rem] font-bold uppercase tracking-[0.16em] text-accent">Today’s prompt</p>
      {p ? (
        <>
          <h2 className="relative mt-2 max-w-[18ch] font-serif text-[2.1rem] font-normal italic leading-[1.05] tracking-normal sm:max-w-[22ch] sm:text-[2.6rem]">{p.text}</h2>
          <div className="relative mt-5 flex flex-wrap items-center gap-3">
            {p.answered ? (
              <span className="inline-flex h-10 items-center gap-2 rounded-full bg-accent-soft px-4 text-[0.875rem] font-semibold text-accent">
                <Check className="size-4" /> You answered
              </span>
            ) : (
              <Button onClick={() => openComposer({ prompt: { key: p.key, text: p.text } })}>
                Answer <ArrowRight className="size-4" />
              </Button>
            )}
            <Link to="/discover?prompt=1" className="-my-2 py-2 text-[0.875rem] text-fg-muted hover:text-fg hover:underline">
              {p.people > 0 ? `${p.people} ${p.people === 1 ? 'person has' : 'people have'} answered` : 'Be the first to answer'}
            </Link>
          </div>
        </>
      ) : (
        <div className="mt-3 h-24 animate-pulse rounded-2xl bg-bg-muted" />
      )}
    </section>
  );
}

function WriteBar() {
  const me = useAuthedMe();
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-line bg-card p-2.5 shadow-paper">
      <Avatar user={me} size={40} />
      <button onClick={() => openComposer()} className="h-11 min-w-0 flex-1 truncate rounded-full bg-bg-muted px-4 text-left text-[0.9375rem] text-fg-subtle transition-colors hover:bg-bg-hover">
        <span className="min-[400px]:hidden">Write a note…</span>
        <span className="max-[399px]:hidden">What’s on your mind?</span>
      </button>
      <button
        onClick={() => openComposer({ whisper: true })}
        aria-label="Write a whisper"
        title="Whisper (anonymous)"
        className="flex h-11 items-center gap-2 rounded-full bg-whisper px-4 text-[0.875rem] font-semibold text-on-whisper transition-transform hover:scale-[1.03] active:scale-95"
      >
        <VenetianMask className="size-4" /> <span className="max-sm:hidden">Whisper</span>
      </button>
      <button onClick={() => openComposer()} aria-label="Write a note" className="flex size-11 items-center justify-center rounded-full bg-accent text-on-accent transition-transform hover:scale-105 active:scale-95 sm:hidden">
        <PenLine className="size-[18px]" />
      </button>
    </div>
  );
}

function MoodStrip({ value, onChange }: { value: string | null; onChange: (m: string | null) => void }) {
  const pulse = useQuery({ queryKey: ['pulse'], queryFn: () => api.get<{ total: number; moods: { mood: string; count: number }[] }>('/feed/pulse'), staleTime: 60_000 });
  const counts = new Map(pulse.data?.moods.map((m) => [m.mood, m.count]));
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Filter by mood">
      <button
        role="radio"
        aria-checked={!value}
        onClick={() => onChange(null)}
        className={cn('h-9 shrink-0 rounded-full border px-4 text-[0.8125rem] font-semibold transition-colors', !value ? 'border-fg bg-fg text-bg' : 'border-line bg-card text-fg-muted hover:bg-bg-hover')}
      >
        All moods
      </button>
      {MOODS.map((m) => {
        const on = value === m.key;
        const n = counts.get(m.key) ?? 0;
        return (
          <button
            key={m.key}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : m.key)}
            className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-semibold transition-all', on ? 'border-transparent text-fg' : 'border-line bg-card text-fg-muted hover:bg-bg-hover')}
            style={on ? { background: `color-mix(in srgb, ${m.color} 26%, var(--wt-card))`, boxShadow: `inset 0 0 0 1.5px ${m.color}` } : undefined}
          >
            <span aria-hidden>{m.emoji}</span>
            {m.label}
            {n > 0 && <span className="text-[0.6875rem] tabular-nums text-fg-subtle">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  const prefs = usePrefs();
  const me = useAuthedMe();
  useDocumentTitle('Home');
  const [tab, setTab] = useState<Tab>(prefs.homeTab);
  const [mood, setMood] = useState<string | null>(null);
  const dismissed = useFlag(GETTING_STARTED_DISMISSED);
  const trending = useTrending(8);
  // The side card is the checklist, or (once dismissed) trending tags. With nothing to show, it is left out entirely.
  const showSide = !dismissed || trending.tags.length > 0;
  const m = mood ? `?mood=${mood}` : '';
  const empty = (title: string, body: string, action?: React.ReactNode) => <EmptyState compact title={title} body={body} action={action} />;

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="mt-1 text-[2rem] font-extrabold leading-tight sm:text-[2.6rem]">
          {greeting()}, <span className="text-accent">{me.displayName.split(' ')[0]}</span>
        </h1>
      </div>

      <div className={cn('grid gap-4', showSide && 'lg:grid-cols-[1.35fr_1fr]')}>
        <div className="flex flex-col gap-4">
          <PromptCard />
          <WriteBar />
        </div>
        {showSide && (
          <div className="flex flex-col">
            {dismissed ? (
              <div className="flex-1 rounded-[22px] border border-line bg-card p-5 shadow-paper">
                <TrendingList limit={8} title="Trending now" />
              </div>
            ) : (
              <GettingStarted />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { value: 'foryou', label: 'For you' },
            { value: 'following', label: 'Following' },
            { value: 'whispers', label: 'Whispers', icon: <VenetianMask /> },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPrefs({ homeTab: t });
          }}
        />
      </div>
      <p className="-mt-2 text-[0.875rem] text-fg-muted">
        {tab === 'foryou' && 'A mix picked for your interests and the people you follow.'}
        {tab === 'following' && 'Only people you follow, newest first.'}
        {tab === 'whispers' && 'Anonymous thoughts. Nobody can tell who wrote them.'}
      </p>
      <MoodStrip value={mood} onChange={setMood} />

      {tab === 'foryou' && (
        <LiveFeed
          key={`foryou-${mood}`}
          masonry
          queryKey={['feed', 'foryou', mood]}
          url={`/feed/foryou${m}`}
          empty={empty(
            mood ? 'No notes with that mood yet' : 'Nothing here yet',
            mood ? 'Write one with this mood and it will show up here.' : 'WeText is just getting started. Write the first note, or invite a friend to join you.',
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openComposer({})}>Write a note</Button>
              {!mood && <InviteButton variant="outline" />}
            </div>,
          )}
        />
      )}
      {tab === 'following' && (
        <LiveFeed
          key={`following-${mood}`}
          masonry
          queryKey={['feed', 'following', mood]}
          url={`/feed/following${m}`}
          empty={empty(
            'Your circle is quiet',
            'Follow people and their notes and reposts land here, in order.',
            <Link to="/connect">
              <Button size="lg">Find your people</Button>
            </Link>,
          )}
        />
      )}
      {tab === 'whispers' && (
        <InfiniteFeed
          key={`whispers-${mood}`}
          masonry
          queryKey={['feed', 'whispers', mood]}
          url={`/feed/whispers${m}`}
          empty={empty('No whispers yet', 'Anonymous thoughts live here. Nobody can tell who wrote them.', <Button size="lg" onClick={() => openComposer({ whisper: true })}>Write a whisper</Button>)}
        />
      )}
    </div>
  );
}
