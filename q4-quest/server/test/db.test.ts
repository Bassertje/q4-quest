import { describe, expect, it } from 'vitest';
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

  it('has strictly increasing migration numbers', () => {
    MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
  });
});
