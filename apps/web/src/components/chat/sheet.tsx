import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * A bottom sheet (phones) that becomes a centred dialog on desktop. Radix
 * handles focus-trapping and Escape/overlay-close for us. Reduced-motion is
 * respected via the shared `animate-sheet` keyframes (which honour the media
 * query in index.css).
 *
 * These sheets are opened programmatically (controlled `open`), so Radix has no
 * trigger to restore focus to on close. We capture whatever had focus when the
 * sheet opened and restore it via `onCloseAutoFocus`, so keyboard users land
 * back on the control they came from instead of on <body>.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideHeader,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  hideHeader?: boolean;
}) {
  // Remember the element focused just before the sheet opened, to restore on
  // close. Most callers mount the sheet conditionally ({open && <Sheet/>}), so
  // at first render `document.activeElement` is still the opener (Radix moves
  // focus into the sheet in a later effect). Capture it synchronously here.
  const opener = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null,
  );
  // Several callers mount the sheet conditionally ({open && <Sheet .../>}), so
  // closing unmounts it before Radix's onCloseAutoFocus can run. Restore focus
  // on unmount (deferred past the focus-trap teardown) so keyboard users return
  // to the control that opened the sheet instead of landing on <body>.
  useEffect(() => {
    return () => {
      const el = opener.current;
      if (el && el !== document.body && document.contains(el)) {
        setTimeout(() => {
          if (document.contains(el) && (document.activeElement === document.body || document.activeElement === null)) {
            el.focus();
          }
        }, 0);
      }
    };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="backdrop fixed inset-0 z-[55] animate-fade-in" />
        <Dialog.Content
          onCloseAutoFocus={(e) => {
            const el = opener.current;
            if (el && document.contains(el)) {
              e.preventDefault();
              el.focus();
            }
          }}
          className={cn(
            'fixed z-[55] flex w-full flex-col overflow-hidden bg-card shadow-2xl outline-none animate-sheet',
            'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[26px] pb-[env(safe-area-inset-bottom)]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[82vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-[440px] sm:rounded-[26px] sm:border sm:border-line sm:pb-0',
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          {!hideHeader && (
            <div className="relative flex shrink-0 items-center justify-center px-4 pb-2 pt-3">
              <span aria-hidden className="absolute top-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
              <Dialog.Title className="mt-2 font-display text-[1.0625rem] font-bold sm:mt-0">{title}</Dialog.Title>
            </div>
          )}
          {hideHeader && <Dialog.Title className="sr-only">{title}</Dialog.Title>}
          {description && <Dialog.Description className="sr-only">{description}</Dialog.Description>}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A labelled row action used inside sheets. 44px tall for touch. */
export function SheetAction({
  icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[48px] w-full items-center gap-3.5 px-5 text-left text-[0.9375rem] transition-colors hover:bg-bg-hover disabled:opacity-40',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      <span className={cn('[&>svg]:size-5', danger ? 'text-danger' : 'text-fg-muted')}>{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}
