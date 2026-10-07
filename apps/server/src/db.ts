import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';

/**
 * Thin async wrapper over @libsql/client that keeps the shape the rest of the
 * code was written against: db.prepare(sql).get/all/run/pluck(...).
 *
 * The same code runs against a local SQLite file (development, tests) and a
 * remote Turso database (production), so the server itself keeps no state and
 * can sleep, restart and redeploy on a free host without losing data.
 */
export type Row = Record<string, any>;

const txStore = new AsyncLocalStorage<Transaction>();

/** Accepts (a, b, c), ([a, b, c]) or ({1: a, 2: b, 3: c}) for numbered ?N placeholders. */
function normalizeArgs(args: unknown[]): InValue[] {
  let list: unknown[] = args;
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof Uint8Array) && !(args[0] instanceof ArrayBuffer)) {
    const only = args[0] as Record<string, unknown>;
    if (Array.isArray(only)) list = only;
    else list = Object.keys(only).map(Number).sort((a, b) => a - b).map((k) => only[k]);
  }
  return list.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as InValue)));
}

function toRow(columns: string[], row: ArrayLike<unknown>): Row {
  const out: Row = {};
  for (let i = 0; i < columns.length; i++) {
    const v = row[i];
    out[columns[i]!] = v instanceof ArrayBuffer ? Buffer.from(v) : v;
  }
  return out;
}

/** FIFO async mutex. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    return release;
  }
}

const WRITE_SQL = /^\s*(insert|update|delete|replace|create|alter|drop|pragma|vacuum|reindex)\b/i;

class Statement {
  constructor(
    private readonly db: DB,
    private readonly sql: string,
    private readonly plucked = false,
  ) {}

  pluck() {
    return new Statement(this.db, this.sql, true);
  }

  private async exec(args: unknown[]) {
    const stmt = { sql: this.sql, args: normalizeArgs(args) };
    // Inside a transaction: use it. Plain writes queue behind any open transaction.
    return this.db.guarded(this.sql, (runner) => runner.execute(stmt));
  }

  async get(...args: unknown[]): Promise<any> {
    const r = await this.exec(args);
    const first = r.rows[0];
    if (!first) return undefined;
    return this.plucked ? first[0] : toRow(r.columns, first);
  }

  async all(...args: unknown[]): Promise<any[]> {
    const r = await this.exec(args);
    return this.plucked ? r.rows.map((row) => row[0]) : r.rows.map((row) => toRow(r.columns, row));
  }

  async run(...args: unknown[]): Promise<{ changes: number }> {
    const r = await this.exec(args);
    return { changes: r.rowsAffected };
  }
}

export class DB {
  constructor(readonly client: Client) {}

  /**
   * SQLite allows one writer at a time, and the local engine blocks the whole
   * process while it waits for a lock. So writes and transactions are queued
   * here instead: only one runs at a time, reads stay fully concurrent.
   */
  private readonly writeLock = new Mutex();

  /** Inside db.transaction() every statement goes through that transaction. */
  async guarded<T>(sql: string, fn: (runner: Client | Transaction) => Promise<T>): Promise<T> {
    const tx = txStore.getStore();
    if (tx) return fn(tx);
    if (!WRITE_SQL.test(sql)) return fn(this.client);
    const release = await this.writeLock.acquire();
    try {
      return await fn(this.client);
    } finally {
      release();
    }
  }

  prepare(sql: string) {
    return new Statement(this, sql);
  }

  async exec(sql: string): Promise<void> {
    await this.guarded('INSERT', (r) => r.executeMultiple(sql));
  }

  /** Runs fn atomically. Nested calls join the outer transaction. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txStore.getStore()) return fn();
    const release = await this.writeLock.acquire();
    try {
      const tx = await this.client.transaction('write');
      try {
        const result = await txStore.run(tx, fn);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback().catch(() => {});
        throw err;
      } finally {
        tx.close();
      }
    } finally {
      release();
    }
  }

  close() {
    this.client.close();
  }
}

/**
 * Schema is applied as an ordered list of migrations. Each entry runs once, in
 * its own transaction, and the number applied is recorded in `schema_version`,
 * so adding a new entry at the end is all that's needed to evolve the schema.
 */
const migrations: string[] = [
  /* sql */ `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    bio           TEXT NOT NULL DEFAULT '',
    location      TEXT NOT NULL DEFAULT '',
    website       TEXT NOT NULL DEFAULT '',
    avatar_url    TEXT,
    banner_url    TEXT,
    interests     TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
    traits        TEXT NOT NULL DEFAULT '{}',   -- JSON Record<trait, 0..100>
    is_private    INTEGER NOT NULL DEFAULT 0,
    dm_policy     TEXT NOT NULL DEFAULT 'everyone', -- everyone | following | nobody
    show_online   INTEGER NOT NULL DEFAULT 1,
    onboarded     INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,               -- sha256(token)
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent   TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE posts (
    id           TEXT PRIMARY KEY,
    author_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL DEFAULT '',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    reply_to_id  TEXT REFERENCES posts(id) ON DELETE SET NULL,
    quote_of_id  TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL,
    edited_at    INTEGER
  );
  CREATE INDEX posts_author ON posts(author_id, created_at DESC);
  CREATE INDEX posts_reply ON posts(reply_to_id, created_at);
  CREATE INDEX posts_created ON posts(created_at DESC);

  CREATE TABLE post_media (
    id       TEXT PRIMARY KEY,
    post_id  TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    url      TEXT NOT NULL,
    width    INTEGER NOT NULL,
    height   INTEGER NOT NULL,
    alt      TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX post_media_post ON post_media(post_id);

  CREATE TABLE post_tags (
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag        TEXT NOT NULL COLLATE NOCASE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag)
  );
  CREATE INDEX post_tags_tag ON post_tags(tag, created_at DESC);

  CREATE TABLE polls (
    post_id    TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    ends_at    INTEGER NOT NULL
  );
  CREATE TABLE poll_options (
    id       TEXT PRIMARY KEY,
    post_id  TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    label    TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE TABLE poll_votes (
    post_id   TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, user_id)
  );

  CREATE TABLE likes (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );
  CREATE INDEX likes_post ON likes(post_id);

  CREATE TABLE reposts (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );
  CREATE INDEX reposts_post ON reposts(post_id);
  CREATE INDEX reposts_user ON reposts(user_id, created_at DESC);

  CREATE TABLE bookmarks (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'active', -- active | pending
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
  );
  CREATE INDEX follows_followee ON follows(followee_id, status);

  CREATE TABLE blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );
  CREATE INDEX blocks_blocked ON blocks(blocked_id);

  CREATE TABLE mutes (
    muter_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (muter_id, muted_id)
  );

  CREATE TABLE match_passes (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, target_id)
  );

  CREATE TABLE notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL, -- like | reply | repost | quote | mention | follow | follow_request | follow_accept
    post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    read_at    INTEGER
  );
  CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);

  CREATE TABLE conversations (
    id              TEXT PRIMARY KEY,
    pair_key        TEXT NOT NULL UNIQUE, -- sorted "a:b" user ids, one DM per pair
    created_at      INTEGER NOT NULL,
    last_message_at INTEGER NOT NULL
  );
  CREATE TABLE conversation_members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at    INTEGER NOT NULL DEFAULT 0,
    cleared_at      INTEGER NOT NULL DEFAULT 0,
    muted           INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE INDEX conversation_members_user ON conversation_members(user_id);

  CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL DEFAULT '',
    image_url       TEXT,
    image_w         INTEGER,
    image_h         INTEGER,
    reply_to_id     TEXT REFERENCES messages(id) ON DELETE SET NULL,
    created_at      INTEGER NOT NULL,
    deleted_at      INTEGER
  );
  CREATE INDEX messages_conv ON messages(conversation_id, created_at DESC);

  CREATE TABLE message_reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );

  -- Full-text search over post content (external-content FTS5 kept in sync by triggers)
  CREATE VIRTUAL TABLE posts_fts USING fts5(content, content='posts', content_rowid='rowid', tokenize='unicode61');
  CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
    INSERT INTO posts_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
  CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
    INSERT INTO posts_fts(posts_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END;
  CREATE TRIGGER posts_au AFTER UPDATE OF content ON posts BEGIN
    INSERT INTO posts_fts(posts_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO posts_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
  `,
  /* sql */ `
  ALTER TABLE posts ADD COLUMN mood TEXT;
  ALTER TABLE posts ADD COLUMN expires_at INTEGER;
  ALTER TABLE posts ADD COLUMN prompt_key TEXT;
  CREATE INDEX posts_prompt ON posts(prompt_key, created_at DESC);
  CREATE INDEX posts_expires ON posts(expires_at) WHERE expires_at IS NOT NULL;
  CREATE INDEX posts_mood ON posts(mood, created_at DESC) WHERE mood IS NOT NULL;
  CREATE INDEX posts_anon ON posts(is_anonymous, created_at DESC);
  `,
  /* sql */ `
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,                 -- sha256(token); the token itself is only in the email
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX password_resets_user ON password_resets(user_id);
  `,
  /* sql */ `
  -- Uploaded photos live in the database so the server itself stays stateless.
  CREATE TABLE files (
    path       TEXT PRIMARY KEY,                 -- '<userId>/<name>.webp', same as the public URL path
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX files_user ON files(user_id);
  `,
  /* sql */ `
  -- Every time a post is edited, the text it had before is kept here so "edited" can show the history.
  CREATE TABLE post_edits (
    id          TEXT PRIMARY KEY,
    post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,        -- the text that was replaced
    replaced_at INTEGER NOT NULL      -- when it was replaced (the moment of the edit)
  );
  CREATE INDEX post_edits_post ON post_edits(post_id, replaced_at);
  `,
];

/** Fading posts are hard-deleted once they expire. */
export async function purgeExpired(db: DB) {
  return (await db.prepare('DELETE FROM posts WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now())).changes;
}

/**
 * Opens the database. `url` is a Turso URL (libsql://...) or a local file
 * (file:/path/to.db, or a plain path). ':memory:' is not supported because
 * transactions use a second connection.
 */
export async function openDb(url: string, authToken?: string): Promise<DB> {
  let target = url;
  if (!/^(libsql|https?|wss?|file):/.test(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    target = `file:${target}`;
  } else if (target.startsWith('file:')) {
    fs.mkdirSync(path.dirname(target.slice('file:'.length)), { recursive: true });
  }
  // `timeout` is the SQLite busy timeout (ms) and is applied to every pooled connection.
  const db = new DB(createClient({ url: target, authToken: authToken || undefined, timeout: 10_000 } as Parameters<typeof createClient>[0]));
  if (target.startsWith('file:')) {
    await db.client.execute('PRAGMA journal_mode = WAL');
    await db.client.execute('PRAGMA synchronous = NORMAL');
  }
  await migrate(db);
  return db;
}

async function migrate(db: DB) {
  await db.client.execute('CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)');
  await db.client.execute('INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0)');
  const current = ((await db.client.execute('SELECT version FROM schema_version WHERE id = 1')).rows[0]?.[0] as number) ?? 0;
  for (let i = current; i < migrations.length; i++) {
    const tx = await db.client.transaction('write');
    try {
      await tx.executeMultiple(migrations[i]!);
      await tx.execute({ sql: 'UPDATE schema_version SET version = ? WHERE id = 1', args: [i + 1] });
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    } finally {
      tx.close();
    }
  }
}
