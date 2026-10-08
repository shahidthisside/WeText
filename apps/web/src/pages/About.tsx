import { Link } from 'react-router';
import { Button, Logo } from '../components/ui';
import { useMe } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const FEATURES = [
  ['Say it your way', 'Write a note with your name, or a whisper without it. Add a mood, let it fade after a day, or answer the daily prompt.'],
  ['Find your people', 'Connect matches you on interests and vibe, and shows exactly where you line up. No swiping, just good company.'],
  ['Talk in real time', 'Chats with typing indicators, read receipts, reactions, replies and photos. Requests keep strangers out of your inbox.'],
  ['You’re in control', 'Private accounts, DM permissions, hide your online status, mute and block. Sign out remote sessions any time.'],
];

export default function About() {
  const { me } = useMe();
  useDocumentTitle('About');
  return (
    <div className="mx-auto max-w-[680px] px-6 py-12">
      <Link to={me ? '/home' : '/'} aria-label="WeText home">
        <Logo wordmark className="text-[1.1rem]" />
      </Link>
      <h1 className="mt-12 text-[3rem] font-extrabold leading-[1.02]">A quieter corner of the <span className="font-serif font-normal italic text-accent">internet</span>.</h1>
      <p className="mt-5 text-lg leading-relaxed text-fg-muted">
        WeText is a place for short thoughts and real conversations. It’s built around one idea: it’s easier to find your people when you can say what you actually think.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-[22px] border border-line bg-card p-5 shadow-paper">
            <h2 className="text-[1.25rem] font-bold">{t}</h2>
            <p className="mt-1.5 text-[0.9375rem] text-fg-muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <Link to={me ? '/home' : '/signup'}>
          <Button size="lg">{me ? 'Back to WeText' : 'Join WeText'}</Button>
        </Link>
      </div>
    </div>
  );
}
