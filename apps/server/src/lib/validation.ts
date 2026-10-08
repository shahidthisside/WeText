import { z } from 'zod';
import { codePointLength } from './text.js';

/** A refine that rejects strings longer than `max` Unicode code points (not UTF-16 units). */
export const withinCodePoints = (max: number) => (s: string) => codePointLength(s) <= max;


export const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'api', 'login', 'signup', 'logout', 'settings', 'explore', 'search', 'home', 'messages',
  'notifications', 'bookmarks', 'connect', 'wetext', 'support', 'help', 'about', 'post', 'posts', 'tag', 'me',
  'onboarding', 'uploads', 'null', 'undefined',
]);

export const username = z
  .string()
  .trim()
  .min(3, 'Must be at least 3 characters')
  .max(20, 'Must be 20 characters or fewer')
  .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscores')
  .refine((u) => !RESERVED_USERNAMES.has(u.toLowerCase()), 'That username is reserved');

export const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
export const password = z
  .string()
  .min(8, 'Must be at least 8 characters')
  .max(200, 'Too long')
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), 'Use at least one letter and one number');
export const displayName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100)
  .refine(withinCodePoints(50), 'Max 50 characters');

/** Opaque pagination cursor, encoded as base64url JSON. */
export const cursor = z.string().max(200).optional();

export function encodeCursor(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url');
}
export function decodeCursor<T>(c: string | undefined, schema: z.ZodType<T>): T | null {
  if (!c) return null;
  try {
    const r = schema.safeParse(JSON.parse(Buffer.from(c, 'base64url').toString()));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Uploaded media must live in the uploader's own folder. */
export const uploadUrl = z.string().regex(/^\/uploads\/[a-z0-9]+\/[a-zA-Z0-9_-]+\.(webp|gif)$/, 'Invalid upload');
