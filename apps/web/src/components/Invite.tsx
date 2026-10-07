import { Check, Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui';

/** Copies (or natively shares) the link to this WeText site so people can bring friends. */
export function InviteButton({ variant = 'primary', label = 'Invite friends' }: { variant?: 'primary' | 'outline'; label?: string }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.origin;
  const canShare = 'share' in navigator && matchMedia('(pointer: coarse)').matches;

  async function invite() {
    if (canShare) {
      try {
        await navigator.share({ title: 'WeText', text: 'Come hang out on WeText.', url });
        return;
      } catch {
        /* cancelled: fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copy this link and send it to a friend', url);
    }
  }

  return (
    <Button variant={variant} onClick={invite}>
      {copied ? <Check className="size-4" /> : canShare ? <Share2 className="size-4" /> : <Link2 className="size-4" />}
      {copied ? 'Link copied' : label}
    </Button>
  );
}
