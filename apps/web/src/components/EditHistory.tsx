import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { cn, fullTime } from '../lib/utils';
import { EmptyState, Modal } from './ui';

interface Version {
  content: string;
  at: number;
  current: boolean;
}

interface History {
  edited: boolean;
  complete: boolean;
  versions: Version[];
}

/** The "edited" label on a post. Click it to see every earlier version of the text. */
export function EditedLabel({ postId, className, onDark }: { postId: string; className?: string; onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn('rounded-sm underline-offset-2 hover:underline focus-visible:underline', className)}
        title="See edit history"
      >
        edited
      </button>
      {open && <EditHistoryDialog postId={postId} open={open} onOpenChange={setOpen} onDark={onDark} />}
    </>
  );
}

function EditHistoryDialog({ postId, open, onOpenChange }: { postId: string; open: boolean; onOpenChange: (o: boolean) => void; onDark?: boolean }) {
  const q = useQuery({
    queryKey: ['post-history', postId],
    queryFn: () => api.get<History>(`/posts/${postId}/history`),
    enabled: open,
    staleTime: 0,
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit history">
      <div onClick={(e) => e.stopPropagation()} className="px-5 pb-6">
        {q.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading edit history">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-bg-muted" />
            ))}
          </div>
        ) : q.isError ? (
          <EmptyState compact title="Couldn’t load the history" body="This post may have been deleted, or you no longer have access to it." />
        ) : (
          <>
            <ol className="relative space-y-3 border-l border-line-strong pl-5">
              {q.data.versions.map((v, i) => (
                <li key={v.at + ':' + i} className="relative">
                  <span aria-hidden className={cn('absolute -left-[26px] top-4 size-2.5 rounded-full border-2 border-card', v.current ? 'bg-accent' : 'bg-line-strong')} />
                  <div className="rounded-2xl border border-line bg-bg-muted/50 p-4">
                    <p className="flex flex-wrap items-center gap-x-2 text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                      {v.current ? <span className="text-accent">Current version</span> : <span>{i === q.data.versions.length - 1 ? 'Original' : 'Earlier version'}</span>}
                      <span className="font-medium normal-case tracking-normal">· {fullTime(v.at)}</span>
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere]">
                      {v.content || <span className="text-fg-subtle">(no text)</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {!q.data.complete && <p className="mt-4 text-[0.8125rem] text-fg-muted">Earlier versions of this post weren’t saved.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
