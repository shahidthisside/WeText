import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router';
import { EmptyState, Button } from '../components/ui';
import { ConversationList, NewMessageModal } from '../components/chat/ConversationList';
import { Thread } from '../components/chat/Thread';
import { StarredScreen } from '../components/chat/StarredScreen';
import { cn } from '../lib/utils';

/**
 * Chats.
 *
 * Phones (< md): the conversation LIST is a full-bleed page under the global
 * top bar, with the dock visible. Opening a THREAD mounts a full-screen view
 * (position: fixed, inset 0, 100dvh) that covers the top bar and dock.
 *
 * The phone views are rendered through a portal to `document.body`. The page
 * content lives inside an `animate-rise` wrapper (Layout.tsx) whose transform
 * establishes a containing block — that would trap `position: fixed` and make
 * the chat look like "a window inside a window". Portalling to the body sidesteps
 * the transformed ancestor so the list is truly edge-to-edge and the thread
 * truly covers the whole viewport.
 *
 * Desktop (md+): a refined two-pane card that uses the page width well.
 */
export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [starred, setStarred] = useState(false);

  // The starred view is list-level only.
  useEffect(() => {
    if (id) setStarred(false);
  }, [id]);

  return (
    <>
      {/* Phone / small screens: portalled, full-bleed. */}
      <PhonePortal>
        <div className="fixed inset-x-0 bottom-0 top-16 flex flex-col bg-card md:hidden">
          {starred ? (
            <StarredScreen onBack={() => setStarred(false)} />
          ) : (
            <ConversationList activeId={id} onOpenStarred={() => setStarred(true)} />
          )}
        </div>
        {id && (
          <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-card md:hidden">
            <Thread key={id} id={id} onBack={() => navigate('/chats')} />
          </div>
        )}
      </PhonePortal>

      {/* Desktop: two-pane card */}
      <div className="hidden md:block">
        <div className="mx-auto mt-4 flex h-[calc(100dvh-10.75rem)] min-h-[420px] max-w-[1160px] overflow-hidden rounded-[24px] border border-line bg-card shadow-paper">
          <section className="flex w-[360px] shrink-0 flex-col border-r border-line">
            {starred ? <StarredScreen onBack={() => setStarred(false)} /> : <ConversationList activeId={id} onOpenStarred={() => setStarred(true)} />}
          </section>
          <section className={cn('flex min-w-0 flex-1 flex-col')}>
            {id ? <Thread key={id} id={id} onBack={() => navigate('/chats')} /> : <NoSelection />}
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * Portal to document.body so the phone list/thread escape the transformed
 * `animate-rise` ancestor and anchor to the viewport. The children are still
 * gated with `md:hidden`, so nothing renders on desktop.
 */
function PhonePortal({ children }: { children: React.ReactNode }) {
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('data-chat-phone-portal', '');
    return el;
  });
  useEffect(() => {
    document.body.appendChild(host);
    return () => {
      host.remove();
    };
  }, [host]);
  return createPortal(children, host);
}

function NoSelection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        title="Select a message"
        body="Choose from your existing conversations, start a new one, or find someone on Connect."
        action={
          <Button size="lg" onClick={() => setOpen(true)}>
            New chat
          </Button>
        }
      />
      <NewMessageModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
