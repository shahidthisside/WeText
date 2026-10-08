// Hashtags: letters/digits/underscore, must contain at least one letter, max 50 chars.
const TAG_RE = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]{1,50})/gu;
const MENTION_RE = /(^|[^\p{L}\p{N}_@])@([a-zA-Z0-9_]{2,20})/gu;

export function extractTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[2]!;
    if (/\p{L}/u.test(tag)) out.add(tag.toLowerCase());
  }
  return [...out].slice(0, 10);
}

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) out.add(m[2]!.toLowerCase());
  return [...out].slice(0, 20);
}

/** Collapse runs of 3+ blank lines and trim; keeps user formatting otherwise. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Length in Unicode code points, not UTF-16 units. A string like "👍" is one
 * code point but two UTF-16 units, so `.length` would over-count it and reject
 * posts, bios and names that are actually within the limit (or let through
 * surrogate-heavy input past a byte-ish cap). Spreading the string iterates by
 * code point.
 */
export function codePointLength(text: string): number {
  return [...text].length;
}
