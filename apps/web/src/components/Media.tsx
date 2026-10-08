import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { cn } from '../lib/utils';
import type { Media } from '../lib/types';

/** An image that degrades to a "Couldn't load photo" tile if it fails to load. */
function SafeImage({
  src,
  alt,
  className,
  style,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={cn('flex min-h-24 flex-col items-center justify-center gap-1 bg-bg-muted text-fg-subtle', className)} style={style} role="img" aria-label="Couldn’t load photo">
        <ImageOff className="size-6" aria-hidden />
        <span className="text-[0.75rem] font-medium">Couldn’t load photo</span>
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={className} style={style} onError={() => setFailed(true)} onClick={onClick} />;
}

/** Badge shown on a photo that carries a description. */
function AltBadge() {
  return <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">Alt</span>;
}

export function MediaGrid({ media, className }: { media: Media[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  const n = media.length;
  const single = n === 1 ? media[0]! : null;

  return (
    <>
      <div
        className={cn('mt-3 overflow-hidden rounded-2xl border border-line', n > 1 && 'grid aspect-[16/9] gap-0.5', n === 2 && 'grid-cols-2', n >= 3 && 'grid-cols-2 grid-rows-2', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {single ? (
          <button className="relative block w-full" onClick={() => setOpen(0)} aria-label={single.alt?.trim() ? `Open photo: ${single.alt}` : 'Open photo'}>
            <SafeImage
              src={single.url}
              alt={single.alt?.trim() || 'Photo'}
              className="max-h-[510px] w-full bg-bg-muted object-cover"
              style={{ aspectRatio: `${Math.max(single.width / single.height, 0.75)}` }}
            />
            {single.alt?.trim() && <AltBadge />}
          </button>
        ) : (
          media.map((m, i) => (
            <button key={m.url} onClick={() => setOpen(i)} className={cn('relative min-h-0 overflow-hidden', n === 3 && i === 0 && 'row-span-2')} aria-label={m.alt?.trim() ? `Open photo ${i + 1}: ${m.alt}` : `Open photo ${i + 1}`}>
              <SafeImage src={m.url} alt={m.alt?.trim() || 'Photo'} className="size-full bg-bg-muted object-cover transition-opacity hover:opacity-90" />
              {m.alt?.trim() && <AltBadge />}
            </button>
          ))
        )}
      </div>
      <Lightbox media={media} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}

export function Lightbox({ media, index, onClose, onIndex }: { media: { url: string; alt?: string }[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  useEffect(() => {
    if (index === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index < media.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [index, media.length, onIndex]);

  const current = index !== null ? media[index] : undefined;

  return (
    <Dialog.Root open={index !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/90 animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-[70] flex items-center justify-center outline-none" aria-describedby={undefined} onClick={onClose}>
          <Dialog.Title className="sr-only">Image viewer</Dialog.Title>
          {current && (
            <div className="flex max-h-[92vh] max-w-[94vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <SafeImage src={current.url} alt={current.alt?.trim() || 'Photo'} className="max-h-[88vh] max-w-[94vw] object-contain" />
              {current.alt?.trim() && <p className="mt-3 max-w-[94vw] text-center text-[0.8125rem] text-white/80">{current.alt}</p>}
            </div>
          )}
          <button className="absolute left-4 top-4 flex size-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80" onClick={onClose} aria-label="Close photo viewer">
            <X className="size-5" />
          </button>
          {index !== null && index > 0 && (
            <button
              className="absolute left-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                onIndex(index - 1);
              }}
              aria-label="Previous photo"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index !== null && index < media.length - 1 && (
            <button
              className="absolute right-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                onIndex(index + 1);
              }}
              aria-label="Next photo"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
