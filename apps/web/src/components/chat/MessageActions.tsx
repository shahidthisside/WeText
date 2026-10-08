import { Copy, Forward, Info, Pencil, Reply, Star, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GroupMember, Message, ReadReceipt } from '../../lib/types';
import { canEdit, REACTIONS } from '../../lib/chat';
import { clockTime, fullTime } from '../../lib/utils';
import { Sheet, SheetAction } from './sheet';
import { Avatar, Modal } from '../ui';

export interface ActionTarget {
  m: Message;
  mine: boolean;
}

/**
 * The per-message action sheet (bottom sheet on phones, centred dialog on
 * desktop). Shows the reaction row plus contextual actions.
 */
export function MessageActionSheet({
  target,
  meId,
  otherSeenAt,
  seenByAll,
  onClose,
  onReact,
  onReply,
  onForward,
  onStar,
  onEdit,
  onDeleteForMe,
  onUnsend,
  onInfo,
}: {
  target: ActionTarget | null;
  meId: string;
  otherSeenAt: number;
  /** In a group, whether every other active member has read a message. */
  seenByAll?: (createdAt: number) => boolean;
  onClose: () => void;
  onReact: (m: Message, emoji: string | null) => void;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onStar: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDeleteForMe: (m: Message) => void;
  onUnsend: (m: Message) => void;
  onInfo: (m: Message) => void;
}) {
  const open = !!target;
  const m = target?.m;
  const mine = target?.mine ?? false;
  const myReaction = m?.reactions.find((r) => r.userIds.includes(meId))?.emoji ?? null;

  async function copy() {
    if (!m?.body) return;
    try {
      await navigator.clipboard.writeText(m.body);
      toast('Copied to clipboard');
    } catch {
      toast.error('Couldn’t copy');
    }
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Message actions" hideHeader>
      {m && (
        <div className="pb-2">
          {/* Reaction row */}
          <div className="flex items-center justify-between gap-1 px-4 py-3">
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onReact(m, myReaction === e ? null : e);
                  onClose();
                }}
                aria-label={`React ${e}`}
                className={`flex size-11 items-center justify-center rounded-full text-2xl transition-transform active:scale-90 ${myReaction === e ? 'bg-accent-soft' : 'hover:bg-bg-hover'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="h-px bg-line" />
          <SheetAction icon={<Reply />} onClick={() => (onReply(m), onClose())}>
            Reply
          </SheetAction>
          {m.body && (
            <SheetAction icon={<Copy />} onClick={copy}>
              Copy text
            </SheetAction>
          )}
          <SheetAction icon={<Forward />} onClick={() => (onForward(m), onClose())}>
            Forward
          </SheetAction>
          <SheetAction icon={<Star className={m.starred ? 'fill-current text-accent' : ''} />} onClick={() => (onStar(m), onClose())}>
            {m.starred ? 'Unstar' : 'Star'}
          </SheetAction>
          <SheetAction icon={<Info />} onClick={() => (onInfo(m), onClose())}>
            Message info
          </SheetAction>
          {canEdit(m, meId) && (
            <SheetAction icon={<Pencil />} onClick={() => (onEdit(m), onClose())}>
              Edit
            </SheetAction>
          )}
          <div className="h-px bg-line" />
          <SheetAction icon={<Trash2 />} danger onClick={() => (onDeleteForMe(m), onClose())}>
            Delete for me
          </SheetAction>
          {mine && (
            <SheetAction icon={<Undo2 />} danger onClick={() => (onUnsend(m), onClose())}>
              Unsend for everyone
            </SheetAction>
          )}
          <p className="px-5 pb-1 pt-3 text-[0.75rem] text-fg-subtle">
            Sent {clockTime(m.createdAt)}
            {mine && (seenByAll ? seenByAll(m.createdAt) : otherSeenAt >= m.createdAt) ? ' · Seen' : ''}
          </p>
        </div>
      )}
    </Sheet>
  );
}

/** Detailed "Message info": sent / seen / edited times. */
export function MessageInfoModal({
  message,
  mine,
  otherSeenAt,
  group,
  onClose,
}: {
  message: Message | null;
  mine: boolean;
  otherSeenAt: number;
  /** In a group: members + their read receipts, to build a "Seen by" list. */
  group?: { members: GroupMember[]; readBy: ReadReceipt[]; meId: string };
  onClose: () => void;
}) {
  const seenBy =
    group && message
      ? group.readBy
          .filter((r) => r.at >= message.createdAt && r.userId !== group.meId)
          .map((r) => group.members.find((m) => m.id === r.userId))
          .filter((m): m is GroupMember => !!m)
      : [];
  return (
    <Modal open={!!message} onOpenChange={(o) => !o && onClose()} title="Message info">
      {message && (
        <dl className="px-5 py-2 text-[0.9375rem]">
          <Row label="Sent" value={fullTime(message.createdAt)} />
          {message.editedAt && <Row label="Edited" value={fullTime(message.editedAt)} />}
          {mine && !group && <Row label="Seen" value={otherSeenAt >= message.createdAt ? fullTime(otherSeenAt) : 'Not yet'} />}
          {message.forwarded && <Row label="Forwarded" value="Yes" />}
          {message.expiresAt && <Row label="Disappears" value={fullTime(message.expiresAt)} />}
          {message.reactions.length > 0 && (
            <Row label="Reactions" value={message.reactions.map((r) => `${r.emoji} ${r.userIds.length}`).join('  ')} />
          )}
          {mine && group && (
            <div className="border-b border-line py-3 last:border-0">
              <p className="mb-2 text-fg-muted">Seen by</p>
              {seenBy.length ? (
                <ul className="flex flex-col gap-2">
                  {seenBy.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Avatar user={m} size={28} />
                      <span className="font-medium">{m.displayName}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-fg-subtle">No one yet</p>
              )}
            </div>
          )}
        </dl>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
