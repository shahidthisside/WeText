import { ArrowRight, Hourglass, Sparkles, VenetianMask } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Button, Logo } from '../components/ui';
import { MoodChip } from '../lib/moods';
import { useDocumentTitle } from '../lib/useDocumentTitle';

function HeroCards() {
  return (
    <div className="relative mx-auto h-[460px] w-full max-w-[520px] select-none" aria-hidden>
      {/* note */}
      <div className="absolute left-0 top-6 w-[270px] -rotate-6 rounded-[22px] border border-line bg-card p-4 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.35)] animate-rise">
        <div className="flex items-center gap-2.5">
          <Avatar user={{ displayName: 'You', username: 'you', avatarUrl: null }} size={34} />
          <div className="leading-tight">
            <p className="font-display text-[0.875rem] font-bold">Your name</p>
            <p className="text-[0.75rem] text-fg-subtle">@you · just now</p>
          </div>
        </div>
        <div className="mt-3">
          <MoodChip mood="tender" />
        </div>
        <p className="mt-2 font-display text-[1.25rem] font-semibold leading-tight tracking-tight">Say it in a few words. Add a mood. Let it fade if it’s only for now.</p>
      </div>

      {/* whisper */}
      <div className="absolute right-0 top-0 w-[250px] rotate-3 rounded-[22px] bg-whisper p-5 text-on-whisper shadow-[0_24px_50px_-20px_rgb(0_0_0/0.5)] animate-rise" style={{ animationDelay: '120ms' }}>
        <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-on-whisper-muted">
          <VenetianMask className="size-3.5" /> Whisper
        </p>
        <p className="mt-2 font-serif text-[1.6rem] leading-[1.1]">Say the thing you can’t say out loud. Nobody will know it was you.</p>
        <div className="mt-3">
          <MoodChip mood="heavy" onDark />
        </div>
      </div>

      {/* match */}
      <div className="absolute bottom-10 left-6 w-[250px] rotate-2 rounded-[22px] border border-line bg-card p-4 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.35)] animate-rise" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center gap-3">
          <div className="relative size-14 shrink-0">
            <svg viewBox="0 0 52 52" className="size-full -rotate-90">
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--wt-line)" strokeWidth="4" />
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--wt-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray="121 138" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-[0.75rem] font-extrabold uppercase tracking-wide">match</span>
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold">Someone like you</p>
            <p className="text-[0.75rem] text-fg-muted">Shared interests and vibe</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['Music', 'Books', 'Travel'].map((t) => (
            <span key={t} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.75rem] font-semibold text-accent">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* chat */}
      <div className="absolute bottom-0 right-2 w-[230px] -rotate-3 space-y-2 animate-rise" style={{ animationDelay: '360ms' }}>
        <div className="w-fit rounded-3xl rounded-bl-md bg-card px-4 py-2 text-[0.875rem] shadow-paper ring-1 ring-line">Hey, we matched!</div>
        <div className="ml-auto w-fit rounded-3xl rounded-br-md bg-accent px-4 py-2 text-[0.875rem] text-on-accent shadow-paper">Hey! Glad we did 👋</div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: <Hourglass />, title: 'Notes that feel like something', body: 'Tag a note with a mood. Let it fade after a day if it’s only for now. Answer the daily prompt and see how others did.' },
  { icon: <VenetianMask />, title: 'Whispers', body: 'Say the thing you can’t say out loud. Whispers are anonymous for real: nobody, including the people you follow, can tell they’re yours.' },
  { icon: <Sparkles />, title: 'Find your people', body: 'Connect matches you on interests and vibe, and shows exactly where you line up. No swiping. Just good company.' },
];

export default function Landing() {
  useDocumentTitle('Say what’s on your mind');
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex h-20 max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Logo wordmark className="text-[1.05rem]" />
        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/signup">
            <Button variant="inverse">Join</Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-10">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-[0.8125rem] font-semibold text-fg-muted">
              <span className="size-2 rounded-full bg-accent" /> A calmer place to think out loud
            </p>
            <h1 className="mt-6 text-[3.1rem] font-extrabold leading-[0.98] sm:text-[4.6rem]">
              Say it like
              <br />
              you <span className="font-serif text-[1.1em] font-normal italic text-accent">mean</span> it.
            </h1>
            <p className="mt-6 max-w-[480px] text-[1.125rem] leading-relaxed text-fg-muted">
              WeText is where you share what’s on your mind, under your name or in a whisper, and meet the people who get it. Then keep talking, in real time.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button size="lg">
                  Start writing <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline">
                  I have an account
                </Button>
              </Link>
            </div>
          </div>
          <HeroCards />
        </section>

        <section className="border-y border-line bg-card/60">
          <div className="mx-auto grid max-w-[1180px] gap-px px-5 py-14 sm:px-8 md:grid-cols-3 md:gap-10">
            {FEATURES.map((f) => (
              <div key={f.title} className="py-4">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-5">{f.icon}</span>
                <h2 className="mt-4 text-[1.35rem] font-bold leading-tight">{f.title}</h2>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[760px] px-5 py-20 text-center sm:px-8">
          <h2 className="text-[2.4rem] font-extrabold leading-tight sm:text-[3rem]">
            Your thoughts deserve <span className="font-serif font-normal italic text-accent">better</span> company.
          </h2>
          <Link to="/signup" className="mt-8 inline-block">
            <Button size="lg">Create your account</Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-[0.8125rem] text-fg-subtle">
        <Link to="/about" className="hover:underline">
          About
        </Link>
        <span className="mx-3">·</span>© {new Date().getFullYear()} WeText
      </footer>
    </div>
  );
}
