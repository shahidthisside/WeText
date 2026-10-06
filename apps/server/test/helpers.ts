import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

export interface TestUser {
  cookie: string;
  id: string;
  username: string;
}

export async function makeApp() {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wetext-up-'));
  const app = await buildApp({ dbFile: ':memory:', uploadDir, logger: false });
  await app.ready();
  return app;
}

let n = 0;
export async function signup(app: FastifyInstance, username?: string, extra: Record<string, unknown> = {}): Promise<TestUser> {
  const u = username ?? `user${++n}${Math.floor(Math.random() * 1000)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { username: u, email: `${u}@example.com`, password: 'passw0rd!', displayName: u.toUpperCase() },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.body}`);
  const cookie = (res.headers['set-cookie'] as string | string[]);
  const raw = (Array.isArray(cookie) ? cookie[0] : cookie)!.split(';')[0]!;
  const user = res.json().user;
  if (Object.keys(extra).length) {
    await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie: raw }, payload: extra });
  }
  return { cookie: raw, id: user.id, username: user.username };
}

export function api(app: FastifyInstance, user?: TestUser) {
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: user ? { cookie: user.cookie } : {} });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, body: unknown = {}) => call('POST', url, body),
    patch: (url: string, body: unknown) => call('PATCH', url, body),
    put: (url: string, body: unknown) => call('PUT', url, body),
    del: (url: string) => call('DELETE', url),
  };
}
