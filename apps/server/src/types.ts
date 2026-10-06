import type { DB } from './db.js';
import type { Realtime } from './realtime.js';

export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  bio: string;
  location: string;
  website: string;
  avatar_url: string | null;
  banner_url: string | null;
  interests: string;
  traits: string;
  is_private: number;
  dm_policy: 'everyone' | 'following' | 'nobody';
  show_online: number;
  onboarded: number;
  created_at: number;
  last_seen_at: number;
}

export interface PostRow {
  id: string;
  author_id: string;
  content: string;
  is_anonymous: number;
  mood: string | null;
  expires_at: number | null;
  prompt_key: string | null;
  reply_to_id: string | null;
  quote_of_id: string | null;
  created_at: number;
  edited_at: number | null;
}

export interface Ctx {
  db: DB;
  rt: Realtime;
  uploadDir: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: Ctx;
  }
  interface FastifyRequest {
    user: UserRow | null;
    sessionId: string | null;
  }
}
