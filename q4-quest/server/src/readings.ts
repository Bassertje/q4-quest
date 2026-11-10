import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SensorKey } from './options.ts';

export type ReadingSource = 'live' | 'history' | 'statistics' | 'mock';

export interface Reading {
  key: SensorKey;
  entityId: string;
  ts: number; // epoch milliseconds
  value: string;
  attrs: Record<string, unknown> | null;
  source: ReadingSource;
}

/** Small data-access layer for the readings table. */
export class ReadingStore {
  private db: DatabaseSync;
  private insertStmt: StatementSync;
  private latestStmt: StatementSync;
  private beforeStmt: StatementSync;
  private seriesStmt: StatementSync;
  private countStmt: StatementSync;
  private statesStmt: StatementSync;
  private unitSeriesStmt: StatementSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO readings (entity_key, entity_id, ts, value, attrs_json, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    this.latestStmt = db.prepare(
      'SELECT ts, value, attrs_json FROM readings WHERE entity_key = ? ORDER BY ts DESC LIMIT 1',
    );
    this.beforeStmt = db.prepare(
      'SELECT ts, value FROM readings WHERE entity_key = ? AND ts < ? ORDER BY ts DESC LIMIT 1',
    );
    this.seriesStmt = db.prepare(
      'SELECT ts, CAST(value AS REAL) AS value FROM readings WHERE entity_key = ? ORDER BY ts',
    );
    this.statesStmt = db.prepare('SELECT ts, value AS state FROM readings WHERE entity_key = ? ORDER BY ts');
    this.unitSeriesStmt = db.prepare(
      `SELECT ts, CAST(value AS REAL) AS value, json_extract(attrs_json, '$.unit_of_measurement') AS unit
       FROM readings WHERE entity_key = ? ORDER BY ts`,
    );
    this.countStmt = db.prepare('SELECT entity_key AS key, COUNT(*) AS n FROM readings GROUP BY entity_key');
  }

  /** Insert a reading; returns false when a reading with the same key and time already exists. */
  insert(r: Reading): boolean {
    const res = this.insertStmt.run(
      r.key,
      r.entityId,
      r.ts,
      r.value,
      r.attrs ? JSON.stringify(r.attrs) : null,
      r.source,
    );
    return Number(res.changes) > 0;
  }

  latest(key: SensorKey): { ts: number; value: string; attrs: Record<string, unknown> | null } | null {
    const row = this.latestStmt.get(key) as { ts: number; value: string; attrs_json: string | null } | undefined;
    return row ? { ts: row.ts, value: row.value, attrs: row.attrs_json ? JSON.parse(row.attrs_json) : null } : null;
  }

  /** Latest reading strictly before a timestamp. */
  before(key: SensorKey, ts: number): { ts: number; value: string } | null {
    return (this.beforeStmt.get(key, ts) as { ts: number; value: string } | undefined) ?? null;
  }

  /** Numeric time series for a key, sorted by time. */
  series(key: SensorKey): { ts: number; value: number }[] {
    return this.seriesStmt.all(key) as { ts: number; value: number }[];
  }

  /** Text states for a key (e.g. the parking brake), sorted by time. */
  states(key: SensorKey): { ts: number; state: string }[] {
    return this.statesStmt.all(key) as { ts: number; state: string }[];
  }

  /** Numeric series including the unit of each reading (e.g. W or kW). */
  seriesWithUnit(key: SensorKey): { ts: number; value: number; unit: string | null }[] {
    return this.unitSeriesStmt.all(key) as { ts: number; value: number; unit: string | null }[];
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of this.countStmt.all() as { key: string; n: number }[]) out[row.key] = row.n;
    return out;
  }

  /** Run a function inside a single transaction (much faster for bulk inserts). */
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Iterate over all readings (for the JSON export). */
  *all(): Generator<Record<string, unknown>> {
    const stmt = this.db.prepare(
      'SELECT entity_key, entity_id, ts, value, attrs_json, source FROM readings ORDER BY entity_key, ts',
    );
    for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) yield row;
  }
}
