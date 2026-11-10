import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, migrate, openDatabase, schemaVersion } from '../src/db.ts';

describe('database migrations', () => {
  it('applies all migrations to a fresh database', () => {
    const db = openDatabase(':memory:');
    expect(schemaVersion(db)).toBe(MIGRATIONS.at(-1)!.version);
  });

  it('is idempotent and keeps existing data', () => {
    const db = openDatabase(':memory:');
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('hello', 'world');
    migrate(db);
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('hello') as { value: string };
    expect(row.value).toBe('world');
  });

  it('migration 4 only undoes the record flags set by the 0.5.0 baseline', () => {
    const db = new DatabaseSync(':memory:');
    // Bring a database to version 3 (as in 0.5.0) and simulate its baseline.
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const m of MIGRATIONS.filter((m) => m.version <= 3)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(m.version, m.name, 'x');
    }
    const add = db.prepare('INSERT INTO seen_items (item_key, seen_at) VALUES (?, ?)');
    add.run('record:bestDay:2026-03-02', '2026-11-10T10:00:00.000Z'); // baseline
    add.run('badge:first_charge', '2026-11-10T10:00:00.000Z'); // a real badge reveal
    add.run('record:bestWeek:2026-W12', '2026-11-12T08:00:00.000Z'); // a real record reveal later
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('reveal.records_baseline', '2026-11-10T10:00:00.001Z');

    migrate(db);
    const keys = (db.prepare('SELECT item_key FROM seen_items ORDER BY item_key').all() as { item_key: string }[]).map((r) => r.item_key);
    expect(keys).toEqual(['badge:first_charge', 'record:bestWeek:2026-W12']);
    expect(db.prepare("SELECT 1 FROM meta WHERE key = 'reveal.records_baseline'").get()).toBeUndefined();
  });

  it('migration 5 removes the dropped milestone badges but keeps the rest', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const m of MIGRATIONS.filter((m) => m.version <= 4)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(m.version, m.name, 'x');
    }
    const add = db.prepare('INSERT INTO seen_items (item_key, seen_at) VALUES (?, ?)');
    for (const key of ['badge:milestone_1000', 'badge:milestone_2500', 'badge:milestone_125000', 'badge:milestone_40075', 'badge:first_charge', 'level:3']) {
      add.run(key, '2026-11-10T10:00:00.000Z');
    }
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('setting.followed_badge', 'milestone_20000');

    migrate(db);
    const keys = (db.prepare('SELECT item_key FROM seen_items ORDER BY item_key').all() as { item_key: string }[]).map((r) => r.item_key);
    expect(keys).toEqual(['badge:first_charge', 'badge:milestone_1000', 'badge:milestone_40075', 'level:3']);
    expect((db.prepare("SELECT value FROM meta WHERE key = 'setting.followed_badge'").get() as { value: string }).value).toBe('');
  });

  it('migration 5 keeps a followed badge that still exists', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const m of MIGRATIONS.filter((m) => m.version <= 4)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(m.version, m.name, 'x');
    }
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('setting.followed_badge', 'milestone_40075');
    migrate(db);
    expect((db.prepare("SELECT value FROM meta WHERE key = 'setting.followed_badge'").get() as { value: string }).value).toBe('milestone_40075');
  });

  it('migration 7 records badges already seen as earned', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const m of MIGRATIONS.filter((m) => m.version <= 6)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(m.version, m.name, 'x');
    }
    const add = db.prepare('INSERT INTO seen_items (item_key, seen_at) VALUES (?, ?)');
    add.run('badge:eco_week', '2026-11-10T10:00:00.000Z');
    add.run('badge:challenge_2026-W45', '2026-11-10T10:00:00.000Z');
    add.run('level:3', '2026-11-10T10:00:00.000Z');
    migrate(db);
    expect(db.prepare('SELECT id, unlocked_ts FROM earned_badges').all()).toEqual([
      { id: 'eco_week', unlocked_ts: Date.parse('2026-11-10T10:00:00Z') },
    ]);
  });

  it('has strictly increasing migration numbers', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});
