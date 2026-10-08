import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { config } from './config.js';
import { openDb, purgeExpired } from './db.js';
import { HttpError, unauthorized } from './lib/errors.js';
import { hashToken } from './lib/crypto.js';
import { Realtime } from './realtime.js';
import type { Ctx, UserRow } from './types.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import feedRoutes from './routes/feed.js';
import discoverRoutes from './routes/discover.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes, { serveUpload } from './routes/uploads.js';

export interface AppOptions {
  /** Turso URL or local file path. Defaults to DATABASE_URL / DB_FILE. */
  databaseUrl?: string;
  databaseAuthToken?: string;
  logger?: boolean;
}

export function requireUser(req: FastifyRequest): UserRow {
  if (!req.user) throw unauthorized();
  return req.user;
}

export async function buildApp(opts: AppOptions = {}) {
  const app = Fastify({
    logger: opts.logger ?? (!config.isTest && { level: config.isProd ? 'info' : 'warn' }),
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const db = await openDb(opts.databaseUrl ?? config.databaseUrl, opts.databaseAuthToken ?? config.databaseAuthToken);
  const rt = new Realtime(db);
  rt.attach(app.server);
  const ctx: Ctx = { db, rt };
  app.decorate('ctx', ctx);

  await purgeExpired(db);
  const purgeTimer = setInterval(() => void purgeExpired(db).catch(() => {}), 60_000);
  purgeTimer.unref();

  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    rt.close();
    db.close();
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });
  await app.register(rateLimit, { global: false });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Resolve the session cookie on every API request.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;

    // CSRF defense in depth (cookies are SameSite=Lax): reject cross-origin state changes.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !isAllowedOrigin(origin, req)) {
        return reply.code(403).send({ error: 'Cross-origin request blocked', code: 'forbidden' });
      }
    }

    const token = req.cookies[config.sessionCookie];
    if (!token) return;
    const sid = hashToken(token);
    const now = Date.now();
    const row = (await db
      .prepare(
        `SELECT u.*, s.last_used_at AS s_last_used FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ?`,
      )
      .get(sid, now)) as (UserRow & { s_last_used: number }) | undefined;
    if (!row) {
      clearSessionCookie(reply);
      return;
    }
    const { s_last_used, ...user } = row;
    req.user = user;
    req.sessionId = sid;
    // Sliding expiry, throttled to one write per minute.
    if (now - s_last_used > 60_000) {
      await db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').run(now, now + config.sessionTtlMs, sid);
      await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, user.id);
    }
  });

  // Authed JSON API responses must never be cached by browsers or shared proxies: they are
  // per-user and may contain private data. (Uploaded photos are served separately and stay cached.)
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: err.message, code: err.code });
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path.join('.');
      return reply
        .code(400)
        .send({ error: first ? `${field ? field + ': ' : ''}${first.message}` : 'Invalid input', code: 'validation' });
    }
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode && e.statusCode < 500) {
      const msg = e.code === 'FST_REQ_FILE_TOO_LARGE' ? 'File is too large (max 8 MB)' : (e.message ?? 'Bad request');
      return reply.code(e.statusCode).send({ error: msg, code: 'bad_request' });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on our end', code: 'internal' });
  });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(meRoutes, { prefix: '/api/me' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(postRoutes, { prefix: '/api/posts' });
  await app.register(feedRoutes, { prefix: '/api/feed' });
  await app.register(discoverRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(reportRoutes, { prefix: '/api' });
  await app.register(messageRoutes, { prefix: '/api' });
  await app.register(uploadRoutes, { prefix: '/api/uploads' });

  // User uploads live in the database. File names are random and never change, so they cache forever.
  // serveUpload() handles images (immutable caching) and audio (Range/206/416, Accept-Ranges).
  app.get('/uploads/:uid/:name', async (req, reply) => {
    const { uid, name } = req.params as { uid: string; name: string };
    return serveUpload(db, req, reply, uid, name);
  });

  // Production: serve the built SPA.
  const webDist = config.webDist;
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/uploads/')) {
        return reply.type('text/html').sendFile('index.html', webDist);
      }
      return reply.code(404).send({ error: 'Not found', code: 'not_found' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found', code: 'not_found' }));
  }

  return app;
}

function isAllowedOrigin(origin: string, req: FastifyRequest) {
  if (origin === config.webOrigin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(config.sessionCookie, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.sessionCookie, { path: '/' });
}
