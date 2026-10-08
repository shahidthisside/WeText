import { Camera, Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage, uploadImage } from '../lib/api';
import { useMeta } from '../lib/auth';
import type { UserSummary } from '../lib/types';
import { cn } from '../lib/utils';
import { Avatar, PageSpinner, Spinner } from './ui';

export function InterestPicker({ value, onChange, max = 15 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const meta = useMeta();
  if (!meta.data) return <PageSpinner />;
  const toggle = (i: string) => {
    if (value.includes(i)) onChange(value.filter((x) => x !== i));
    else if (value.length >= max) toast(`You can pick up to ${max}`);
    else onChange([...value, i]);
  };
  return (
    <div className="space-y-6">
      {Object.entries(meta.data.interests).map(([group, list]) => (
        <section key={group}>
          <h3 className="mb-2.5 font-display text-[1.0625rem] font-bold">{group}</h3>
          <div className="flex flex-wrap gap-2">
            {list.map((i) => {
              const on = value.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(i)}
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[0.9375rem] font-semibold transition-all active:scale-95',
                    on ? 'border-fg bg-fg text-bg' : 'border-line-strong bg-card hover:bg-bg-hover',
                  )}
                >
                  {on && <Check className="size-4" />}
                  {i}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TraitSliders({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const meta = useMeta();
  if (!meta.data) return <PageSpinner />;
  return (
    <div className="space-y-7">
      {meta.data.traits.map((t) => {
        const v = value[t.key] ?? 50;
        return (
          <div key={t.key}>
            <div className="mb-2 flex justify-between text-[0.9375rem] font-semibold">
              <span className={cn('transition-colors', v < 45 ? 'text-fg' : 'text-fg-subtle')}>{t.low}</span>
              <span className={cn('transition-colors', v > 55 ? 'text-fg' : 'text-fg-subtle')}>{t.high}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={v}
              aria-label={`${t.low} to ${t.high}`}
              onChange={(e) => onChange({ ...value, [t.key]: Number(e.target.value) })}
              className="wt-range w-full cursor-pointer"
            />
          </div>
        );
      })}
    </div>
  );
}

export function ImageUpload({
  kind,
  url,
  onChange,
  user,
  className,
}: {
  kind: 'avatar' | 'banner';
  url: string | null;
  onChange: (url: string | null) => void;
  user?: Pick<UserSummary, 'displayName' | 'username'>;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File) {
    setBusy(true);
    try {
      const r = await uploadImage(f, kind);
      onChange(r.url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cn('relative', className)}>
      {kind === 'avatar' ? (
        <Avatar user={user ? { ...user, avatarUrl: url } : null} size={112} className="rounded-[36%] ring-4 ring-card" />
      ) : (
        <div className="aspect-[3/1] w-full bg-bg-muted">{url && <img src={url} alt="" className="size-full object-cover" />}</div>
      )}
      {/* On a banner the camera sits in the middle; on an avatar it is a small badge in the corner so it never covers the initials. */}
      <div className={kind === 'avatar' ? 'absolute -bottom-3 -right-3 flex' : 'absolute inset-0 flex items-center justify-center gap-3'}>
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={kind === 'avatar' ? 'Upload profile photo' : 'Upload header image'}
          className={cn('flex items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80', kind === 'avatar' ? 'size-11 ring-[3px] ring-card' : 'size-11')}
        >
          {busy ? <Spinner /> : <Camera className="size-5" />}
        </button>
        {url && kind === 'banner' && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove header image"
            className="flex size-11 items-center justify-center rounded-full bg-black/55 text-lg text-white transition-colors hover:bg-black/70"
          >
            ×
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
