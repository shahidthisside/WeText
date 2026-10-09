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

/**
 * The Jami project's public relay, with the login published in its documentation
 * (https://docs.jami.net/en_US/developer/going-further/setting-up-your-own-turn-server.html). It is not a secret.
 * UDP first; TCP for networks that block UDP. Its TLS port did not answer when tested, so it is not listed.
 */
export const JAMI_RELAY: IceServer = {
  urls: ['turn:turn.jami.net:3478?transport=udp', 'turn:turn.jami.net:3478?transport=tcp'],
  username: 'ring',
  credential: 'ring',
};

const urlsOf = (s: IceServer) => (Array.isArray(s.urls) ? s.urls : [s.urls]);

/** Every configured relay: your own first (static, then the credentials service), then Jami. Duplicates are dropped. */
async function relayServers(): Promise<IceServer[]> {
  const all: IceServer[] = [];
  if (config.turnUrls.length && config.turnUsername && config.turnCredential) {
    all.push({ urls: config.turnUrls, username: config.turnUsername, credential: config.turnCredential });
  }
  all.push(...(await fromApi()));
  if (config.jamiRelay) all.push(JAMI_RELAY);
  const seen = new Set<string>();
  const out: IceServer[] = [];
  for (const s of all) {
    const urls = urlsOf(s).filter((u) => {
      const key = `${u}|${s.username ?? ''}|${s.credential ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (urls.length) out.push({ ...s, urls });
  }
  return out;
}

async function fromApi(): Promise<IceServer[]> {
  if (!config.turnApiUrl) return [];
  if (cached && Date.now() - cached.at < (cached.servers.length ? FRESH_MS : RETRY_MS)) return cached.servers;
  try {
    const res = await fetch(config.turnApiUrl, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const list = (await res.json()) as unknown;
    const servers = (Array.isArray(list) ? list : [])
      .filter((s): s is IceServer => !!s && typeof s === 'object' && 'urls' in s)
      // Keep STUN-less duplicates out: we add our own STUN above.
      .filter((s) => urlsOf(s).some((u) => /^turns?:/.test(u)))
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
