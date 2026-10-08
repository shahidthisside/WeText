import { useEffect } from 'react';

const SUFFIX = 'WeText';

/**
 * Sets `document.title` for the lifetime of the component and restores the
 * previous title on unmount. Pass a bare page name; the WeText suffix is added
 * automatically. Pass `null`/`''` to fall back to just the suffix.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const prev = document.title;
    const clean = (title ?? '').trim();
    document.title = clean ? `${clean} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Build a short snippet from a note body for use in a title. */
export function snippet(text: string, max = 50) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}
