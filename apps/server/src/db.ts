import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

/**
 * Schema is applied as an ordered list of migrations. Each entry runs once and
 * its index is recorded in `PRAGMA user_version`, so adding a new entry at the
 * end is all that's needed to evolve the schema.
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
];

/** Fading posts are hard-deleted once they expire. */
export function purgeExpired(db: DB) {
  return db.prepare('DELETE FROM posts WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now()).changes;
}

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]!);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}
