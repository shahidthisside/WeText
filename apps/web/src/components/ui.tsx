import * as Dialog from '@radix-ui/react-dialog';
import * as DM from '@radix-ui/react-dropdown-menu';
import { ArrowLeft, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '../lib/utils';
import type { UserSummary } from '../lib/types';

/* ---------------------------------------------------------------- Button */

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-[0_6px_16px_-8px_var(--wt-accent)]',
  inverse: 'bg-fg text-bg hover:opacity-90',
  secondary: 'bg-bg-muted text-fg hover:bg-line',
  outline: 'border border-line-strong bg-card text-fg hover:bg-bg-hover',
  ghost: 'text-fg hover:bg-bg-hover',
  danger: 'bg-danger text-white hover:opacity-90',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.8125rem]',
  md: 'h-10 px-5 text-[0.9375rem]',
  lg: 'h-12 px-7 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background,transform,opacity] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="absolute size-4" />}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>{children}</span>
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'accent' }>(
  function IconButton({ label, className, tone = 'default', children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 pointer-coarse:size-10',
          tone === 'accent' ? 'text-accent hover:bg-accent-soft' : 'text-fg hover:bg-bg-hover',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/* ---------------------------------------------------------------- Spinner */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('size-5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21.5 12A9.5 9.5 0 0 0 12 2.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-10 text-accent" role="status" aria-label="Loading">
      <Spinner className="size-6" />
    </div>
  );
}

/* ---------------------------------------------------------------- Avatar */

// Earthy, ink-friendly avatar colours
const PALETTE = ['#c8553d', '#4d8a4f', '#3d5be0', '#9a4a8c', '#d18b12', '#2f7f86', '#7b5e45', '#5a6b3a', '#b5476b'];
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  user,
  size = 40,
  online,
  className,
  anonymous,
}: {
  user: Pick<UserSummary, 'displayName' | 'avatarUrl' | 'username'> | null;
  size?: number;
  online?: boolean;
  className?: string;
  anonymous?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const dot = Math.max(8, Math.round(size * 0.26));
  const initials = (user?.displayName ?? '')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const colorKey = user?.username || user?.displayName || '?';

  let inner: ReactNode;
  if (anonymous || !user) {
    inner = (
      <div className="flex size-full items-center justify-center rounded-[36%] bg-fg text-bg" aria-label="Anonymous">
        <svg viewBox="0 0 24 24" className="size-[55%]" fill="currentColor" aria-hidden>
          <path d="M12 3c-3.6 0-6 2.3-6.6 5.8L4 9.2V11h16V9.2l-1.4-.4C18 5.3 15.6 3 12 3Zm-8 9.5c0 .3.2.5.5.5h15c.3 0 .5-.2.5-.5S19.8 12 19.5 12h-15c-.3 0-.5.2-.5.5ZM8 15a3 3 0 1 0 2.8 4h2.4a3 3 0 1 0 .3-1.5h-3a3 3 0 0 0-2.5-2.5Zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm8 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
        </svg>
      </div>
    );
  } else if (user.avatarUrl && !imgFailed) {
    inner = (
      <img
        src={user.avatarUrl}
        alt=""
        className="size-full rounded-[36%] object-cover"
        loading="lazy"
        draggable={false}
        onError={() => setImgFailed(true)}
      />
    );
  } else {
    inner = (
      <div
        className="flex size-full items-center justify-center rounded-[36%] font-display font-bold text-white"
        style={{ background: PALETTE[hash(colorKey) % PALETTE.length], fontSize: size * 0.38 }}
        aria-hidden
      >
        {initials || '?'}
      </div>
    );
  }
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {inner}
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-[2.5px] border-card bg-online"
          style={{ width: dot, height: dot }}
          aria-label="Online"
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Name line */

export function VerifiedLock({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <svg viewBox="0 0 24 24" className="inline size-[1em] shrink-0 text-fg-muted" fill="currentColor" aria-label="Private account">
      <path d="M17 9V7A5 5 0 0 0 7 7v2a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3ZM9 7a3 3 0 0 1 6 0v2H9Zm4 9.7V18h-2v-1.3a2 2 0 1 1 2 0Z" />
    </svg>
  );
}

export function UserLink({ user, className, children }: { user: Pick<UserSummary, 'username'>; className?: string; children: ReactNode }) {
  return (
    <Link to={`/${user.username}`} className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------- Modal */

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  className,
  hideHeader,
  headerRight,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
  hideHeader?: boolean;
  headerRight?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="backdrop fixed inset-0 z-50 animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex w-full flex-col overflow-hidden bg-card shadow-2xl outline-none animate-sheet',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] sm:inset-auto sm:left-1/2 sm:top-[9vh] sm:max-h-[82vh] sm:-translate-x-1/2 sm:rounded-[28px] sm:border sm:border-line',
            wide ? 'sm:max-w-[640px]' : 'sm:max-w-[520px]',
            className,
          )}
          aria-describedby={undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {hideHeader ? (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          ) : (
            <div className="flex h-16 shrink-0 items-center gap-3 px-4">
              <Dialog.Close asChild>
                <IconButton label="Close">
                  <X className="size-5" />
                </IconButton>
              </Dialog.Close>
              <Dialog.Title className="flex-1 truncate font-display text-lg font-bold tracking-tight">{title}</Dialog.Title>
              {headerRight}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger = true,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="backdrop fixed inset-0 z-[60] animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-line bg-card p-7 shadow-2xl outline-none animate-sheet"
          aria-describedby={undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
          <div className="mt-2 text-[0.9375rem] text-fg-muted">{body}</div>
          <div className="mt-6 flex flex-col gap-3">
            <Button variant={danger ? 'danger' : 'inverse'} size="lg" block onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
            <Dialog.Close asChild>
              <Button variant="outline" size="lg" block>
                Cancel
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------------------------------------------------------- Dropdown */

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={4}
        className="z-[60] min-w-[220px] overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium outline-none data-[highlighted]:bg-bg-hover',
        danger && 'text-danger',
      )}
    >
      {icon && <span className="[&>svg]:size-[18px]">{icon}</span>}
      {children}
    </DM.Item>
  );
}

/* ---------------------------------------------------------------- Page header */

/** Title block that sits on the page (not a bar). Sticks softly under the top bar. */
export function PageHeader({
  title,
  subtitle,
  back,
  backOnlyMobile,
  right,
  children,
  eyebrow,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  backOnlyMobile?: boolean;
  right?: ReactNode;
  children?: ReactNode;
  eyebrow?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="pb-4 pt-2">
      {(title || back || right) && (
        <div className="flex items-center gap-3">
          {back && (
            <IconButton
              label="Back"
              className={cn('border border-line bg-card', backOnlyMobile && 'md:hidden')}
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/home'))}
            >
              <ArrowLeft className="size-[18px]" />
            </IconButton>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="mb-1 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{eyebrow}</p>}
            {title && <h1 className="text-[1.85rem] font-extrabold leading-[1.1] sm:text-[2.2rem]">{title}</h1>}
            {subtitle && <p className="mt-1 line-clamp-2 text-[0.9375rem] text-fg-muted">{subtitle}</p>}
          </div>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/* ---------------------------------------------------------------- Segmented tabs */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode; badge?: number; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const el = refs.current[value];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure, tabs.length]);

  // Keep the active tab in view when the strip scrolls horizontally.
  useEffect(() => {
    refs.current[value]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [value]);

  return (
    <div
      ref={box}
      role="tablist"
      className={cn('no-scrollbar relative inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-card p-1', className)}
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 top-1 rounded-full bg-fg shadow-sm transition-[left,width] duration-[350ms] ease-[cubic-bezier(0.3,1.2,0.4,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[t.value] = el;
            }}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative z-10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] font-semibold transition-colors duration-300 active:scale-95 sm:px-4',
              active ? 'text-bg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.icon && <span className="[&>svg]:size-4">{t.icon}</span>}
            {t.label}
            {!!t.badge && <span className="rounded-full bg-accent px-1.5 text-[0.6875rem] font-bold leading-[1.15rem] text-on-accent">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Card */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-card shadow-paper', className)} {...rest}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Empty state */

export function EmptyState({ title, body, action, icon, compact }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={`mx-auto flex max-w-[400px] flex-col items-center px-6 text-center animate-rise ${compact ? 'py-6' : 'py-14'}`}>
      <div className={`relative flex items-center justify-center ${compact ? 'mb-4 size-14' : 'mb-5 size-20'}`}>
        <span className="absolute inset-0 rotate-6 rounded-[26px] bg-accent-soft" />
        <span className="absolute inset-0 -rotate-3 rounded-[26px] border border-line bg-card shadow-paper" />
        <span className="relative text-fg [&>svg]:size-8">{icon ?? <LogoMark className="size-9" tile={false} />}</span>
      </div>
      <h2 className={`font-extrabold leading-tight ${compact ? 'text-[1.25rem]' : 'text-[1.5rem]'}`}>{title}</h2>
      {body && <p className="mt-2 text-[0.9375rem] text-fg-muted">{body}</p>}
      {action && <div className={compact ? 'mt-4' : 'mt-6'}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-fg-muted">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Form controls */

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: ReactNode; counter?: number }>(
  function TextInput({ label, error, hint, counter, className, id, ...rest }, ref) {
    const inputId = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
    const len = typeof rest.value === 'string' ? rest.value.length : 0;
    return (
      <div className={className}>
        <div
          className={cn(
            'group relative rounded-2xl border bg-card transition-colors focus-within:ring-4',
            error ? 'border-danger focus-within:ring-danger/15' : 'border-line-strong focus-within:border-accent focus-within:ring-accent-soft',
          )}
        >
          <div className="flex justify-between px-3.5 pt-2.5 text-[0.75rem] font-semibold uppercase tracking-wide text-fg-muted group-focus-within:text-accent">
            <label htmlFor={inputId}>{label}</label>
            {counter && (
              <span aria-hidden className="invisible tabular-nums group-focus-within:visible">
                {len} / {counter}
              </span>
            )}
          </div>
          <input
            ref={ref}
            id={inputId}
            className="w-full bg-transparent px-3.5 pb-2.5 pt-0.5 text-[1rem] outline-none placeholder:text-fg-subtle"
            aria-invalid={!!error}
            maxLength={counter}
            {...rest}
          />
        </div>
        {error ? <p className="mt-1 px-1 text-[0.8125rem] text-danger">{error}</p> : hint ? <p className="mt-1 px-1 text-[0.8125rem] text-fg-muted">{hint}</p> : null}
      </div>
    );
  },
);

export function TextArea({
  label,
  counter,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; counter?: number }) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const len = typeof rest.value === 'string' ? rest.value.length : 0;
  return (
    <div className={cn('group relative rounded-2xl border border-line-strong bg-card transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft', className)}>
      <div className="flex justify-between px-3.5 pt-2.5 text-[0.75rem] font-semibold uppercase tracking-wide text-fg-muted group-focus-within:text-accent">
        <label htmlFor={id}>{label}</label>
        {counter && (
          <span aria-hidden className="invisible tabular-nums group-focus-within:visible">
            {len} / {counter}
          </span>
        )}
      </div>
      <textarea id={id} rows={3} maxLength={counter} className="w-full resize-none bg-transparent px-3.5 pb-2.5 pt-0.5 text-[1rem] outline-none" {...rest} />
    </div>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 rounded-2xl px-4 py-3.5 hover:bg-bg-hover">
      <span>
        <span className="block text-[0.9375rem]">{label}</span>
        {description && <span className="mt-0.5 block text-[0.8125rem] text-fg-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cn('absolute left-0 top-0.5 size-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Radio({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 rounded-2xl px-4 py-3.5 hover:bg-bg-hover">
      <span>
        <span className="block text-[0.9375rem]">{label}</span>
        {description && <span className="block text-[0.8125rem] text-fg-muted">{description}</span>}
      </span>
      <input type="radio" checked={checked} onChange={onChange} className="sr-only" />
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-accent bg-accent' : 'border-line-strong')}>
        {checked && <span className="size-2 rounded-full bg-on-accent" />}
      </span>
    </label>
  );
}

/* ---------------------------------------------------------------- Logo */

/**
 * The WeText mark: two speech bubbles leaning into each other. Where they
 * overlap, the colours swap — two voices making a third shape ("we").
 */
export function LogoMark({ className, tile = true }: { className?: string; tile?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="WeText">
      {tile && <rect width="64" height="64" rx="18" fill="var(--wt-ink)" />}
      <defs>
        <clipPath id={`wt-a-${id}`}>
          <circle cx="26" cy="29" r="13" />
        </clipPath>
      </defs>
      <circle cx="26" cy="29" r="13" fill={tile ? 'var(--wt-bg)' : 'var(--wt-ink)'} />
      <path d="M16.5 37.5 12 47l10.5-5.2z" fill={tile ? 'var(--wt-bg)' : 'var(--wt-ink)'} />
      <circle cx="38" cy="33" r="13" fill="var(--wt-accent)" />
      <path d="M47.5 41.5 52 51l-10.5-5.2z" fill="var(--wt-accent)" />
      <circle cx="38" cy="33" r="13" fill={tile ? 'var(--wt-ink)' : 'var(--wt-bg)'} clipPath={`url(#wt-a-${id})`} />
    </svg>
  );
}

export function Logo({ className, wordmark = false }: { className?: string; wordmark?: boolean }) {
  if (!wordmark) return <LogoMark className={className} />;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-[1.6em]" />
      <span className="font-display text-[1.25em] font-bold tracking-[-0.04em]">
        we<span className="text-accent">text</span>
      </span>
    </span>
  );
}
