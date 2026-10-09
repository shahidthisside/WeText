import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../app.js';
import { config } from '../config.js';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Free public STUN servers: they let two phones discover how to reach each other directly. */
const STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

/** The relay list from a credentials service is reused for a few minutes so a burst of calls makes one request. */
let cached: { at: number; servers: IceServer[] } | null = null;
const FRESH_MS = 5 * 60_000;
const RETRY_MS = 30_000;

async function relayServers(): Promise<IceServer[]> {
  if (config.turnUrls.length && config.turnUsername && config.turnCredential) {
    return [{ urls: config.turnUrls, username: config.turnUsername, credential: config.turnCredential }];
  }
  if (!config.turnApiUrl) return [];
  if (cached && Date.now() - cached.at < (cached.servers.length ? FRESH_MS : RETRY_MS)) return cached.servers;
  try {
    const res = await fetch(config.turnApiUrl, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const list = (await res.json()) as unknown;
    const servers = (Array.isArray(list) ? list : [])
      .filter((s): s is IceServer => !!s && typeof s === 'object' && 'urls' in s)
      // Keep STUN-less duplicates out: we add our own STUN above.
      .filter((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)))
      .slice(0, 8);
    cached = { at: Date.now(), servers };
    return servers;
  } catch {
    cached = { at: Date.now(), servers: cached?.servers ?? [] };
    return cached.servers;
  }
}

const routes: FastifyPluginAsync = async (app) => {
  /** Connection servers for a call. Only signed-in people get relay credentials, and they are never put in the web bundle. */
  app.get('/ice', { config: { rateLimit: { max: config.isTest ? 1000 : 60, timeWindow: '1 minute' } } }, async (req) => {
    requireUser(req);
    const relay = await relayServers();
    return { iceServers: [...STUN, ...relay], relay: relay.length > 0 };
  });
};

export default routes;
