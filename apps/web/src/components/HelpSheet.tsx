import { Compass, Hourglass, MessageCircle, Sparkles, VenetianMask } from 'lucide-react';
import type { ReactNode } from 'react';
import { GETTING_STARTED_DISMISSED } from './GettingStarted';
import { setFlag } from '../lib/flags';
import { closeHelp, useHelpOpen } from '../lib/palette';
import { Modal } from './ui';

const TERMS: { icon: ReactNode; term: string; text: string }[] = [
  { icon: <span className="text-base">📝</span>, term: 'Note', text: 'A short post (up to 500 characters) under your name. You can add photos, a poll, a mood, #tags and @mentions.' },
  { icon: <VenetianMask className="size-4" />, term: 'Whisper', text: 'An anonymous note. Nobody can see who wrote it, not even people who follow you. Only you see your own whispers, under Profile → Whispers.' },
  { icon: <span className="text-base">✨</span>, term: 'Mood', text: 'A small label for how a note feels (Calm, Fired up, Tender…). Use the mood row on Home to see notes by mood.' },
  { icon: <Hourglass className="size-4" />, term: 'Fading note', text: 'Tap the hourglass when writing and the note deletes itself 24 hours later.' },
  { icon: <span className="text-base">💬</span>, term: 'Daily prompt', text: 'One question a day that everyone can answer. Find it at the top of Home.' },
  { icon: <Sparkles className="size-4" />, term: 'Connect & vibe check', text: 'Connect suggests people who share your interests and have a similar vibe. The vibe check shows how close you are on each trait, without revealing anyone’s exact answers.' },
  { icon: <Compass className="size-4" />, term: 'For you / Following', text: 'For you is a mix picked for your interests. Following is only the people you follow, newest first.' },
  { icon: <MessageCircle className="size-4" />, term: 'Requests', text: 'Messages from people you don’t follow wait in Chats → Requests until you reply.' },
];

const KEYS: [string, string][] = [
  ['⌘ K  /  Ctrl K', 'Open search and quick jump anywhere'],
  ['⌘ Enter  /  Ctrl Enter', 'Post the note you’re writing'],
  ['←  →', 'On Connect: skip / follow the current person'],
  ['Enter', 'In a chat: send (Shift + Enter for a new line)'],
  ['Esc', 'Close any window'],
];

export function HelpSheet() {
  const open = useHelpOpen();
  return (
    <Modal open={open} onOpenChange={(o) => !o && closeHelp()} title="How WeText works" wide>
      <div className="space-y-7 px-5 pb-7 sm:px-7">
        <p className="text-[0.9375rem] text-fg-muted">WeText is a place to share short notes, meet people who get you, and chat. Here’s what the words mean.</p>
        <dl className="space-y-4">
          {TERMS.map((t) => (
            <div key={t.term} className="flex gap-3">
              <dt className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-muted">{t.icon}</dt>
              <dd className="min-w-0">
                <p className="font-display font-bold">{t.term}</p>
                <p className="text-[0.875rem] leading-relaxed text-fg-muted">{t.text}</p>
              </dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-fg-subtle">Shortcuts</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {KEYS.map(([k, d]) => (
              <li key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[0.875rem]">
                <span className="text-fg-muted">{d}</span>
                <kbd className="shrink-0 rounded-lg border border-line bg-bg-muted px-2 py-0.5 font-sans text-[0.75rem] font-semibold">{k}</kbd>
              </li>
            ))}
          </ul>
        </section>
        <button
          onClick={() => {
            setFlag(GETTING_STARTED_DISMISSED, false);
            closeHelp();
          }}
          className="text-[0.875rem] font-semibold text-accent hover:underline"
        >
          Show the getting-started checklist again
        </button>
      </div>
    </Modal>
  );
}
