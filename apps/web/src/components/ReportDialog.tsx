import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../lib/api';
import { REPORT_DETAILS_MAX, REPORT_REASONS, submitReport, type ReportReason, type ReportTargetType } from '../lib/reports';
import { Button, Modal } from './ui';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** For the follow-up "also block/mute" prompt. */
  username?: string;
  onBlock?: () => void;
  onMute?: () => void;
}

/**
 * Report a post or user. On success shows a thank-you and, for user-ish
 * targets, offers to also block or mute the person.
 */
export function ReportDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange: (o: boolean) => void; target: ReportTarget }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setReason(null);
    setDetails('');
    setBusy(false);
    setDone(false);
  }

  async function send() {
    if (!reason) return;
    setBusy(true);
    try {
      await submitReport({ targetType: target.type, targetId: target.id, reason, details });
      toast('Thanks, we’ll take a look');
      if (target.onBlock || target.onMute) {
        setDone(true);
      } else {
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const label = target.type === 'post' ? 'this note' : target.username ? `@${target.username}` : 'this person';

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 200);
      }}
      title={done ? 'Report received' : `Report ${label}`}
    >
      {done ? (
        <div className="space-y-5 p-5">
          <p className="text-[0.9375rem] text-fg-muted">
            Thanks for letting us know. Our team will review {label}. Want to stop seeing {target.username ? `@${target.username}` : 'them'} while we do?
          </p>
          <div className="flex flex-col gap-3">
            {target.onMute && (
              <Button
                variant="outline"
                size="lg"
                block
                onClick={() => {
                  target.onMute?.();
                  onOpenChange(false);
                }}
              >
                Mute {target.username ? `@${target.username}` : 'them'}
              </Button>
            )}
            {target.onBlock && (
              <Button
                variant="danger"
                size="lg"
                block
                onClick={() => {
                  target.onBlock?.();
                  onOpenChange(false);
                }}
              >
                Block {target.username ? `@${target.username}` : 'them'}
              </Button>
            )}
            <Button variant="ghost" size="lg" block onClick={() => onOpenChange(false)}>
              No thanks
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 p-5">
          <p className="text-[0.9375rem] text-fg-muted">Why are you reporting {label}? This is anonymous.</p>
          <fieldset>
            <legend className="sr-only">Reason</legend>
            <div className="space-y-1">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-bg-hover"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="mt-1 size-4 shrink-0 accent-[var(--wt-accent)]"
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  <span>
                    <span className="block text-[0.9375rem] font-semibold">{r.label}</span>
                    <span className="block text-[0.8125rem] text-fg-muted">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-2xl border border-line-strong bg-card p-3">
            <label htmlFor="report-details" className="mb-1 block text-[0.75rem] font-semibold uppercase tracking-wide text-fg-muted">
              Add details (optional)
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={REPORT_DETAILS_MAX}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything that helps us understand…"
              className="w-full resize-none bg-transparent text-[0.9375rem] outline-none"
            />
            <p className="mt-1 text-right text-[0.6875rem] tabular-nums text-fg-subtle">
              {details.length} / {REPORT_DETAILS_MAX}
            </p>
          </div>
          <Button size="lg" block onClick={send} loading={busy} disabled={!reason}>
            Submit report
          </Button>
        </div>
      )}
    </Modal>
  );
}
