import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/useOnline';

/**
 * Slim top banner shown while the browser reports it's offline. It stays long
 * enough after coming back online to briefly confirm "Back online", then hides.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [visible, setVisible] = useState(!online);
  const [reconnected, setReconnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!online) {
      setVisible(true);
      setReconnected(false);
    } else if (visible) {
      // Was offline, now back: show a quick confirmation then auto-hide.
      setReconnected(true);
      timer.current = setTimeout(() => {
        setVisible(false);
        setReconnected(false);
      }, 1800);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 px-4 py-1.5 text-center text-[0.8125rem] font-semibold text-white shadow-md"
      style={{ background: reconnected ? 'var(--color-online, #4d8a4f)' : 'var(--color-danger, #c8553d)', paddingTop: 'calc(0.375rem + env(safe-area-inset-top))' }}
    >
      <WifiOff className="size-3.5" aria-hidden />
      {reconnected ? 'Back online' : 'You’re offline. Reconnecting…'}
    </div>
  );
}
