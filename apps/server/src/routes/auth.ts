import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { clearSessionCookie, requireUser, setSessionCookie } from '../app.js';
import { config } from '../config.js';
import { getDummyHash, hashPassword, hashToken, newId, newSessionToken, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, isUniqueViolation, notFound, unauthorized } from '../lib/errors.js';
import { passwordResetMail, sendMail } from '../lib/mailer.js';
import * as v from '../lib/validation.js';
import { me } from '../services/users.js';
import type { UserRow } from '../types.js';

const authRateLimit = { config: { rateLimit: { max: config.isTest ? 1000 : 10, timeWindow: '1 minute' } } };

const routes: FastifyPluginAsync = async (app) => {
  const { db } = app.ctx;

  async function createSession(userId: string, req: FastifyRequest) {
    const token = newSessionToken();
    const now = Date.now();
    await db.prepare(
      'INSERT INTO sessions (id, user_id, user_agent, ip, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(hashToken(token), userId, (req.headers['user-agent'] ?? '').slice(0, 300), req.ip, now, now, now + config.sessionTtlMs);
    return token;
  }

  app.get('/me', async (req) => ({ user: req.user ? (await me(app.ctx, req.user)) : null }));

  app.get('/username-available', async (req) => {
    const q = z.object({ username: z.string() }).parse(req.query);
    const parsed = v.username.safeParse(q.username);
    if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message };
    const taken = (await db.prepare('SELECT id FROM users WHERE username = ?').get(parsed.data)) as { id: string } | undefined;
    const isOwn = taken && req.user && taken.id === req.user.id;
    return { available: !taken || !!isOwn, reason: taken && !isOwn ? 'That username is taken' : undefined };
  });

  app.post('/signup', authRateLimit, async (req, reply) => {
    const body = z
      .object({ username: v.username, email: v.email, password: v.password, displayName: v.displayName })
      .parse(req.body);
    if (await db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) {
      throw conflict('That username is taken', 'username_taken');
    }
    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      throw conflict('An account with that email already exists', 'email_taken');
    }
    const id = newId();
    const now = Date.now();
    try {
      await db.prepare(
        `INSERT INTO users (id, username, email, password_hash, display_name, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, body.username, body.email, await hashPassword(body.password), body.displayName, now, now);
    } catch (err) {
      // Lost a race between the checks above and this INSERT.
      if (isUniqueViolation(err, 'email')) throw conflict('An account with that email already exists', 'email_taken');
      if (isUniqueViolation(err, 'username')) throw conflict('That username is taken', 'username_taken');
      if (isUniqueViolation(err)) throw conflict('That username is taken', 'username_taken');
      throw err;
    }
    setSessionCookie(reply, await createSession(id, req));
    const user = (await db.prepare('SELECT * FROM users WHERE id = ?').get(id)) as UserRow;
    return reply.code(201).send({ user: (await me(app.ctx, user)) });
  });

  app.post('/login', authRateLimit, async (req, reply) => {
    const body = z
      .object({ login: z.string().trim().min(1, 'Enter your username or email').max(254), password: z.string().min(1).max(200) })
      .parse(req.body);
    const login = body.login.replace(/^@/, '');
    const user = (await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login.toLowerCase())) as
      | UserRow
      | undefined;
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !ok) throw unauthorized('Wrong username/email or password');
    setSessionCookie(reply, await createSession(user.id, req));
    return { user: (await me(app.ctx, user)) };
  });

  app.post('/logout', async (req, reply) => {
    if (req.sessionId) {
      await db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
      app.ctx.rt.disconnectSession(req.sessionId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/sessions', async (req) => {
    const user = requireUser(req);
    const rows = (await db
      .prepare('SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC')
      .all(user.id, Date.now())) as { id: string; user_agent: string; ip: string; created_at: number; last_used_at: number }[];
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        userAgent: s.user_agent,
        ip: s.ip,
        createdAt: s.created_at,
        lastUsedAt: s.last_used_at,
        current: s.id === req.sessionId,
      })),
    };
  });

  app.delete('/sessions/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().max(100) }).parse(req.params);
    const r = await db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(id, user.id);
    if (!r.changes) throw notFound('Session not found');
    app.ctx.rt.disconnectSession(id);
    return { ok: true };
  });

  app.post('/sessions/revoke-others', async (req) => {
    const user = requireUser(req);
    const others = (await db
      .prepare('SELECT id FROM sessions WHERE user_id = ? AND id != ?')
      .pluck()
      .all(user.id, req.sessionId)) as string[];
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, req.sessionId);
    others.forEach((id) => app.ctx.rt.disconnectSession(id));
    return { ok: true, revoked: others.length };
  });

  app.post('/password', authRateLimit, async (req) => {
    const user = requireUser(req);
    const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: v.password }).parse(req.body);
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) throw badRequest('Current password is incorrect', 'wrong_password');
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(body.newPassword), user.id);
    // Sign out everywhere else.
    const others = (await db.prepare('SELECT id FROM sessions WHERE user_id = ? AND id != ?').pluck().all(user.id, req.sessionId)) as string[];
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, req.sessionId);
    others.forEach((id) => app.ctx.rt.disconnectSession(id));
    return { ok: true };
  });

  /**
   * Forgot password. Always answers the same way so it can't be used to find out
   * which emails have accounts. The emailed link is built from PUBLIC_URL, never
   * from request headers (that would allow host-header poisoning).
   */
  app.post('/forgot', { config: { rateLimit: { max: config.isTest ? 1000 : 5, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ email: v.email }).parse(req.body);
    const now = Date.now();
    await db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now);
    const user = (await db.prepare('SELECT id, email, display_name FROM users WHERE email = ?').get(body.email)) as
      | { id: string; email: string; display_name: string }
      | undefined;
    if (user) {
      const recent = await db.prepare('SELECT 1 FROM password_resets WHERE user_id = ? AND created_at > ?').get(user.id, now - 60_000);
      if (!recent) {
        const token = newSessionToken();
        await db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
          hashToken(token), user.id, now, now + config.passwordResetTtlMs,
        );
        const base = config.publicUrl ?? config.webOrigin;
        void sendMail(passwordResetMail(user.email, user.display_name, `${base}/reset-password?token=${encodeURIComponent(token)}`));
      }
    }
    return { ok: true };
  });

  app.post('/reset-password', authRateLimit, async (req) => {
    const body = z.object({ token: z.string().min(10).max(200), password: v.password }).parse(req.body);
    const row = (await db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?').get(hashToken(body.token))) as
      | { user_id: string; expires_at: number }
      | undefined;
    if (!row || row.expires_at < Date.now()) throw badRequest('This reset link is invalid or has expired. Request a new one.', 'invalid_token');
    const hash = await hashPassword(body.password);
    const sessionIds = (await db.prepare('SELECT id FROM sessions WHERE user_id = ?').pluck().all(row.user_id)) as string[];
    await db.transaction(async () => {
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
      await db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(row.user_id);
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    });
    sessionIds.forEach((id) => app.ctx.rt.disconnectSession(id));
    return { ok: true };
  });

  app.post('/email', authRateLimit, async (req) => {
    const user = requireUser(req);
    const body = z.object({ email: v.email, password: z.string().min(1).max(200) }).parse(req.body);
    if (!(await verifyPassword(body.password, user.password_hash))) throw badRequest('Password is incorrect', 'wrong_password');
    const taken = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(body.email, user.id);
    if (taken) throw conflict('That email is already in use', 'email_taken');
    try {
      await db.prepare('UPDATE users SET email = ? WHERE id = ?').run(body.email, user.id);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('That email is already in use', 'email_taken');
      throw err;
    }
    return { ok: true };
  });

  app.post('/delete-account', authRateLimit, async (req, reply) => {
    const user = requireUser(req);
    const body = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
    if (!(await verifyPassword(body.password, user.password_hash))) throw badRequest('Password is incorrect', 'wrong_password');
    app.ctx.rt.disconnectUser(user.id);
    await db.transaction(async () => {
      await db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      // Chats that now have nobody in them (a one-to-one chat whose other person is gone, or a group whose
      // last member left) are removed too, so empty conversations do not pile up.
      await db.prepare('DELETE FROM conversations WHERE id NOT IN (SELECT conversation_id FROM conversation_members)').run();
    });
    clearSessionCookie(reply);
    return { ok: true };
  });
};

export default routes;
