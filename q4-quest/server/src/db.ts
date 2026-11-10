import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Numbered migrations. Rules:
 * - Never edit or remove a migration that has been released; add a new one.
 * - Migrations must never lose data (no DROP of tables with user data).
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'meta',
    sql: `
      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'readings',
    sql: `
      CREATE TABLE readings (
        id         INTEGER PRIMARY KEY,
        entity_key TEXT    NOT NULL,
        entity_id  TEXT    NOT NULL,
        ts         INTEGER NOT NULL,
        value      TEXT    NOT NULL,
        attrs_json TEXT,
        source     TEXT    NOT NULL
      );
      CREATE UNIQUE INDEX readings_key_ts ON readings (entity_key, ts);
    `,
  },
];

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/** Apply all pending migrations, each in its own transaction. */
export function migrate(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const current = schemaVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return schemaVersion(db);
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}
