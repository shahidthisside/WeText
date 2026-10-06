import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import type { Media } from '../lib/types';

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
          <button className="block w-full" onClick={() => setOpen(0)} aria-label="Open image">
            <img
              src={single.url}
              alt={single.alt}
              loading="lazy"
              className="max-h-[510px] w-full bg-bg-muted object-cover"
              style={{ aspectRatio: `${Math.max(single.width / single.height, 0.75)}` }}
            />
          </button>
        ) : (
          media.map((m, i) => (
            <button key={m.url} onClick={() => setOpen(i)} className={cn('relative min-h-0 overflow-hidden', n === 3 && i === 0 && 'row-span-2')} aria-label={`Open image ${i + 1}`}>
              <img src={m.url} alt={m.alt} loading="lazy" className="size-full bg-bg-muted object-cover transition-opacity hover:opacity-90" />
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

  return (
    <Dialog.Root open={index !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/90 animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-[70] flex items-center justify-center outline-none" aria-describedby={undefined} onClick={onClose}>
          <Dialog.Title className="sr-only">Image viewer</Dialog.Title>
          {index !== null && media[index] && (
            <img src={media[index]!.url} alt={media[index]!.alt ?? ''} className="max-h-[92vh] max-w-[94vw] object-contain" onClick={(e) => e.stopPropagation()} />
          )}
          <button className="absolute left-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
          {index !== null && index > 0 && (
            <button
              className="absolute left-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                onIndex(index - 1);
              }}
              aria-label="Previous"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index !== null && index < media.length - 1 && (
            <button
              className="absolute right-4 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                onIndex(index + 1);
              }}
              aria-label="Next"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
