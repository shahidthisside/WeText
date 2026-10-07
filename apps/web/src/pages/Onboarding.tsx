import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ImageUpload, InterestPicker, TraitSliders } from '../components/ProfileFields';
import { FollowButton } from '../components/UserRow';
import { Avatar, Button, Logo, PageSpinner, TextArea } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { setMe, useAuthedMe } from '../lib/auth';
import type { Match, Me } from '../lib/types';
import { cn } from '../lib/utils';
import { InviteButton } from '../components/Invite';

const STEPS = ['Profile', 'Interests', 'Personality', 'People'] as const;

export default function Onboarding() {
  const me = useAuthedMe();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);
  const [bio, setBio] = useState(me.bio);
  const [interests, setInterests] = useState<string[]>(me.interests);
  const [traits, setTraits] = useState<Record<string, number>>(Object.keys(me.traits).length ? me.traits : { social: 50, rhythm: 50, mind: 50, style: 50, talk: 50 });
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await api.patch<{ user: Me }>('/me', patch);
      return r.user;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (step === 0 && !(await save({ avatarUrl, bio }))) return;
    if (step === 1 && !(await save({ interests }))) return;
    if (step === 2 && !(await save({ traits }))) return;
    if (step === 3) {
      const u = await save({ onboarded: true });
      if (!u) return;
      setMe(u);
      navigate('/home', { replace: true });
      toast(`Welcome to WeText, ${u.displayName.split(' ')[0]}!`);
      return;
    }
    setStep((s) => s + 1);
  }

  const canNext = step !== 1 || interests.length >= 3;

  return (
    <div className="flex min-h-dvh justify-center sm:items-center sm:py-8">
      <div className="flex w-full max-w-[640px] flex-col bg-card sm:min-h-[680px] sm:rounded-[32px] sm:border sm:border-line sm:shadow-paper">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="w-16">
            {step > 0 && (
              <button className="text-[0.9375rem] font-semibold text-fg-muted hover:text-fg" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
          </div>
          <Logo className="size-8" />
          <div className="w-16 text-right text-[0.8125rem] text-fg-muted">
            {step + 1} / {STEPS.length}
          </div>
        </div>
        <div className="flex gap-1.5 px-8" aria-hidden>
          {STEPS.map((s, i) => (
            <div key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-500', i <= step ? 'bg-accent' : 'bg-bg-muted')} />
          ))}
        </div>

        <div key={step} className="flex-1 animate-rise overflow-y-auto px-8 py-8">
          {step === 0 && (
            <>
              <Heading title="Make it yours" sub="Add a photo and a line about you. People are more likely to follow back when they can see who you are." />
              <div className="mt-8 flex justify-center">
                <ImageUpload kind="avatar" url={avatarUrl} onChange={setAvatarUrl} user={me} />
              </div>
              <TextArea label="Bio" className="mt-8" value={bio} onChange={(e) => setBio(e.target.value)} counter={160} placeholder="Coffee, film cameras and long walks…" />
            </>
          )}
          {step === 1 && (
            <>
              <Heading title="What are you into?" sub={`Pick at least 3. We use these to tune your feed and find people you’ll click with. (${interests.length} selected)`} />
              <div className="mt-8">
                <InterestPicker value={interests} onChange={setInterests} />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <Heading title="A little about your vibe" sub="No wrong answers. This only affects who we suggest on Connect — it’s never shown on your profile." />
              <div className="mt-10">
                <TraitSliders value={traits} onChange={setTraits} />
              </div>
            </>
          )}
          {step === 3 && <SuggestedPeople />}
        </div>

        <div className="border-t border-line px-8 py-4 sm:border-0 sm:pb-8">
          <Button size="lg" variant="inverse" block onClick={next} loading={busy} disabled={!canNext}>
            {step === 3 ? 'Finish' : step === 1 && interests.length < 3 ? `Pick ${3 - interests.length} more` : 'Next'}
          </Button>
          {step === 0 && (
            <button className="mt-3 w-full text-center text-[0.9375rem] text-fg-muted hover:underline" onClick={() => setStep(1)}>
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1 className="text-[2.2rem] font-extrabold leading-[1.05]">{title}</h1>
      <p className="mt-2 text-[1rem] text-fg-muted">{sub}</p>
    </>
  );
}

function SuggestedPeople() {
  const q = useQuery({ queryKey: ['connect', 'onboarding'], queryFn: () => api.get<{ matches: Match[] }>('/connect') });
  return (
    <>
      <Heading title="People you might click with" sub="Based on your interests and vibe. Follow a few to fill your timeline." />
      <div className="-mx-8 mt-6">
        {q.isPending ? (
          <PageSpinner />
        ) : !q.data?.matches.length ? (
          <div className="mx-8 rounded-[22px] border border-dashed border-line-strong px-5 py-6 text-center">
            <p className="font-display text-[1.0625rem] font-bold">You’re one of the first here</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-[0.9375rem] text-fg-muted">
              As more people join, the ones who match your interests will show up in Connect. For now, write your first note, or bring a friend along.
            </p>
            <div className="mt-4 flex justify-center">
              <InviteButton variant="outline" />
            </div>
          </div>
        ) : (
          q.data?.matches.slice(0, 8).map((m) => (
            <div key={m.user.id} className="flex items-start gap-3 px-8 py-3">
              <Avatar user={m.user} size={44} online={m.user.isOnline} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 leading-5">
                    <p className="truncate font-bold">{m.user.displayName}</p>
                    <p className="truncate text-[0.9375rem] text-fg-muted">@{m.user.username}</p>
                  </div>
                  <FollowButton user={m.user} state="none" size="sm" />
                </div>
                {m.user.bio && <p className="mt-1 line-clamp-2 text-[0.9375rem]">{m.user.bio}</p>}
                <p className="mt-1 text-[0.8125rem] font-semibold text-accent">
                  {m.score}% match{m.sharedInterests.length > 0 && ` · ${m.sharedInterests.slice(0, 3).join(', ')}`}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
