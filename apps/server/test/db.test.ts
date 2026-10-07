import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db.js';

let db: DB;
let file: string;
beforeAll(async () => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wetext-db-')), 'db.test.db');
  db = await openDb(file);
  await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, n INTEGER)');
});
afterAll(() => db.close());

const count = async () => (await db.prepare('SELECT COUNT(*) FROM t').pluck().get()) as number;

describe('db adapter', () => {
  it('runs migrations once and records the version', async () => {
    const v = (await db.prepare('SELECT version FROM schema_version').pluck().get()) as number;
    expect(v).toBeGreaterThanOrEqual(4);
    // re-opening an up-to-date database does not re-run migrations or fail
    const again = await openDb(file);
    expect((await again.prepare('SELECT version FROM schema_version').pluck().get()) as number).toBe(v);
    again.close();
  });

  it('supports positional, array and numbered-object parameters', async () => {
    await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('a', 1);
    await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run(['b', 2]);
    const both = await db.prepare('SELECT name FROM t WHERE n = ?1 OR n = ?2 ORDER BY n').pluck().all({ 1: 1, 2: 2 });
    expect(both).toEqual(['a', 'b']);
    const row = (await db.prepare('SELECT * FROM t WHERE name = ?').get('b')) as { name: string; n: number };
    expect(row).toMatchObject({ name: 'b', n: 2 });
    expect(await db.prepare('SELECT * FROM t WHERE name = ?').get('missing')).toBeUndefined();
    expect((await db.prepare('UPDATE t SET n = n + 10').run()).changes).toBe(2);
  });

  it('commits a transaction and rolls back when the callback throws', async () => {
    const before = await count();
    await db.transaction(async () => {
      await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('c', 3);
    });
    expect(await count()).toBe(before + 1);

    await expect(
      db.transaction(async () => {
        await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('d', 4);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await count()).toBe(before + 1);
  });

  it('keeps concurrent transactions and plain queries apart', async () => {
    const before = await count();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    // Transaction A inserts, then waits. A plain query meanwhile must not see A's uncommitted row.
    const a = db.transaction(async () => {
      await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('inside-a', 5);
      await gate;
      throw new Error('rollback a');
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await count()).toBe(before);
    release();
    await expect(a).rejects.toThrow('rollback a');
    expect(await count()).toBe(before);

    // Two transactions started together both complete (the second waits for the first's write lock).
    await Promise.all([
      db.transaction(async () => void (await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('p', 6))),
      db.transaction(async () => void (await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('q', 7))),
    ]);
    expect(await count()).toBe(before + 2);
  });

  it('joins a nested transaction to the outer one', async () => {
    const before = await count();
    await expect(
      db.transaction(async () => {
        await db.transaction(async () => void (await db.prepare('INSERT INTO t (name, n) VALUES (?, ?)').run('nested', 8)));
        throw new Error('outer fails');
      }),
    ).rejects.toThrow();
    expect(await count()).toBe(before);
  });

  it('enforces foreign keys with cascade, inside and outside transactions', async () => {
    await db.exec('CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (id TEXT, pid TEXT REFERENCES parent(id) ON DELETE CASCADE);');
    await db.prepare('INSERT INTO parent VALUES (?)').run('p1');
    await db.prepare('INSERT INTO child VALUES (?, ?)').run('c1', 'p1');
    await db.prepare('DELETE FROM parent WHERE id = ?').run('p1');
    expect(await db.prepare('SELECT COUNT(*) FROM child').pluck().get()).toBe(0);
    await db.prepare('INSERT INTO parent VALUES (?)').run('p2');
    await db.prepare('INSERT INTO child VALUES (?, ?)').run('c2', 'p2');
    await db.transaction(async () => void (await db.prepare('DELETE FROM parent WHERE id = ?').run('p2')));
    expect(await db.prepare('SELECT COUNT(*) FROM child').pluck().get()).toBe(0);
  });
});
