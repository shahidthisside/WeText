import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// apps/server (works from both src/ and dist/)
export const SERVER_ROOT = path.resolve(here, '..');

const env = process.env;

export const config = {
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test' || !!env.VITEST,
  port: Number(env.PORT ?? 4000),
  host: env.HOST ?? '127.0.0.1',
  /** libsql://... for Turso in production; a local file path for development. */
  databaseUrl: env.DATABASE_URL ?? env.DB_FILE ?? path.join(SERVER_ROOT, 'data', 'wetext.db'),
  databaseAuthToken: env.DATABASE_AUTH_TOKEN || undefined,
  webDist: path.resolve(SERVER_ROOT, '..', 'web', 'dist'),
  /** Allowed browser origin for the Vite dev server / deployed web app. */
  webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
  sessionCookie: 'wt_session',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  maxUploadBytes: 8 * 1024 * 1024,
  /** Public https URL of the site (used in emailed links). Required in production. */
  publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, '') || undefined,
  /** Free transactional email via Brevo (https://www.brevo.com). Optional. */
  brevoApiKey: env.BREVO_API_KEY || undefined,
  mailFrom: env.MAIL_FROM || undefined,
  mailFromName: env.MAIL_FROM_NAME || 'WeText',
  /** Optional: the one account allowed to read submitted reports via GET /api/admin/reports. */
  adminUsername: env.ADMIN_USERNAME || undefined,
  /**
   * Relays (TURN) for calls that cannot connect directly, for example two phones on a Wi-Fi that keeps its devices
   * apart. Calls always try a direct route first; a relay only carries a call when no direct route works.
   *
   * - JAMI_RELAY (default on): the public relay of the Jami project (turn.jami.net, with the login its documentation
   *   publishes). Free, but run by a third party with no promise it stays available. Set JAMI_RELAY=off to stop using it.
   * - Optionally your own as well: the three static TURN_* values, and/or TURN_API_URL pointing at a service that
   *   returns an `iceServers` array (for example Metered: https://<app>.metered.live/api/v1/turn/credentials?apiKey=...).
   */
  jamiRelay: !/^(off|false|0|no)$/i.test((env.JAMI_RELAY ?? '').trim()),
  turnUrls: (env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  turnUsername: env.TURN_USERNAME || undefined,
  turnCredential: env.TURN_CREDENTIAL || undefined,
  turnApiUrl: env.TURN_API_URL || undefined,
  passwordResetTtlMs: 30 * 60 * 1000,
  /** Photo storage allowed per account (they live in the shared free database). */
  photoQuotaBytes: Number(env.PHOTO_QUOTA_MB ?? 150) * 1024 * 1024,
  /** Hosted SQLite services reject single values of a few MB, so stored photos stay under this. */
  maxStoredPhotoBytes: 3.5 * 1024 * 1024,
};
