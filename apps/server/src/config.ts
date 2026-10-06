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
  dbFile: env.DB_FILE ?? path.join(SERVER_ROOT, 'data', 'wetext.db'),
  uploadDir: env.UPLOAD_DIR ?? path.join(SERVER_ROOT, 'uploads'),
  webDist: path.resolve(SERVER_ROOT, '..', 'web', 'dist'),
  /** Allowed browser origin for the Vite dev server / deployed web app. */
  webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
  sessionCookie: 'wt_session',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  maxUploadBytes: 8 * 1024 * 1024,
};
