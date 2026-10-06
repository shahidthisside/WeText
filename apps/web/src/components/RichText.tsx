import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';

// URLs, @mentions, #hashtags — in one pass so they never overlap.
const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(^|[^\p{L}\p{N}_@])@([a-zA-Z0-9_]{2,20})|(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]{1,50})/gu;

export function RichText({ text, className }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index!;
    if (m[1]) {
      out.push(text.slice(last, start));
      const url = m[1];
      const display = url.replace(/^https?:\/\/(www\.)?/, '');
      out.push(
        <a
          key={i++}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {display.length > 32 ? display.slice(0, 31) + '…' : display}
        </a>,
      );
      last = start + url.length;
    } else if (m[3]) {
      const lead = m[2] ?? '';
      out.push(text.slice(last, start) + lead);
      out.push(
        <Link key={i++} to={`/${m[3]}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          @{m[3]}
        </Link>,
      );
      last = start + lead.length + 1 + m[3].length;
    } else if (m[5] && /\p{L}/u.test(m[5])) {
      const lead = m[4] ?? '';
      out.push(text.slice(last, start) + lead);
      out.push(
        <Link key={i++} to={`/tag/${encodeURIComponent(m[5].toLowerCase())}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          #{m[5]}
        </Link>,
      );
      last = start + lead.length + 1 + m[5].length;
    }
  }
  out.push(text.slice(last));
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {out.map((n, k) => (
        <Fragment key={k}>{n}</Fragment>
      ))}
    </span>
  );
}
