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
  {
    version: 3,
    name: 'seen_items',
    sql: `
      CREATE TABLE seen_items (
        item_key TEXT PRIMARY KEY,
        seen_at  TEXT NOT NULL
      );
    `,
  },
  {
    // Version 0.5.0 silently marked existing records as seen on the first
    // reveal. Undo exactly those flags so the records are revealed after all;
    // records seen in a real reveal later stay seen. Only seen flags change.
    version: 4,
    name: 'reveal_existing_records',
    sql: `
      DELETE FROM seen_items
      WHERE item_key LIKE 'record:%'
        AND seen_at <= (SELECT value FROM meta WHERE key = 'reveal.records_baseline');
      DELETE FROM meta WHERE key = 'reveal.records_baseline';
    `,
  },
  {
    // 1.2.0: the plain milestone badges (2,500 km, 5,000 km, …) were replaced
    // by the world trip. Remove their seen flags and, if one of them was
    // followed, clear that choice (the app then picks one automatically).
    // The kept badges (1,000 km and Rondje aarde) keep their ids and flags.
    version: 5,
    name: 'world_trip',
    sql: `
      DELETE FROM seen_items
      WHERE item_key LIKE 'badge:milestone!_%' ESCAPE '!'
        AND item_key NOT IN ('badge:milestone_1000', 'badge:milestone_40075');
      UPDATE meta SET value = ''
      WHERE key = 'setting.followed_badge'
        AND value LIKE 'milestone!_%' ESCAPE '!'
        AND value NOT IN ('milestone_1000', 'milestone_40075');
    `,
  },
  {
    // 1.3.0: weekly challenges and their results (kept as history).
    version: 6,
    name: 'challenges',
    sql: `
      CREATE TABLE challenges (
        week         TEXT PRIMARY KEY,
        type         TEXT NOT NULL,
        target       REAL NOT NULL,
        status       TEXT NOT NULL,
        current      REAL,
        completed_ts INTEGER,
        created_at   TEXT NOT NULL
      );
    `,
  },
  {
    // 1.4.0: earned badges are kept even if a later calculation (e.g. the new
    // consumption method) no longer confirms them: badges are never taken away.
    // Seed with every badge already seen in a reveal (date: when it was seen).
    version: 7,
    name: 'earned_badges',
    sql: `
      CREATE TABLE earned_badges (
        id          TEXT PRIMARY KEY,
        unlocked_ts INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO earned_badges (id, unlocked_ts)
      SELECT substr(item_key, 7), CAST(strftime('%s', seen_at) AS INTEGER) * 1000
      FROM seen_items
      WHERE item_key LIKE 'badge:%' AND item_key NOT LIKE 'badge:challenge!_%' ESCAPE '!';
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
