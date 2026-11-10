import type { DatabaseSync } from 'node:sqlite';
import type { HaClient } from '../ha/client.ts';
import { SENSOR_KEYS, type Options, type SensorKey } from '../options.ts';
import type { ReadingSource, ReadingStore } from '../readings.ts';
import { applyEntitiesEvent, stateTimestamp, type CompressedState, type EntitiesEvent } from './compressed.ts';
import { ingest } from './ingest.ts';

const DAY = 86_400_000;
const HISTORY_CHUNK_DAYS = 7;
const HISTORY_MAX_DAYS = 5 * 365;
const HISTORY_EMPTY_CHUNKS_TO_STOP = 4;
const STATS_CHUNK_DAYS = 30;

export interface BackfillStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  step: string | null;
  stored: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface StatRow {
  start: number | string;
  end: number | string;
  max?: number | null;
  mean?: number | null;
  state?: number | null;
}

const toMs = (v: number | string) => (typeof v === 'number' ? v : Date.parse(v));
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Collects sensor states from Home Assistant into the readings table:
 * live via `subscribe_entities`, missed periods via the history API after a
 * reconnect, and a one-off backfill from statistics and history.
 * Read-only: it never calls services.
 */
export class Collector {
  backfill: BackfillStatus = {
    state: 'idle',
    step: null,
    stored: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
  };

  private client: HaClient;
  private store: ReadingStore;
  private db: DatabaseSync;
  private keyByEntity = new Map<string, SensorKey>();
  private cache = new Map<string, { state: string; attrs: Record<string, unknown> }>();
  private listeners = new Set<() => void>();

  constructor(client: HaClient, store: ReadingStore, db: DatabaseSync, options: Options) {
    this.client = client;
    this.store = store;
    this.db = db;
    for (const key of SENSOR_KEYS) {
      const entityId = options.entities[key];
      if (entityId) this.keyByEntity.set(entityId, key);
    }
    const done = this.getMeta('backfill_done_at');
    if (done) this.backfill = { ...this.backfill, state: 'done', finishedAt: done };
  }

  get entityIds(): string[] {
    return [...this.keyByEntity.keys()];
  }

  /** Called whenever new readings were stored. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.client.onConnect(() => void this.onConnected());
  }

  private async onConnected(): Promise<void> {
    if (this.entityIds.length === 0) return;
    const tz = this.client.status.timeZone;
    if (tz) this.setMeta('time_zone', tz);
    try {
      // Everything after the newest stored reading may have been missed while
      // disconnected. Determine this before subscribing, because the
      // subscription immediately delivers (and stores) the current states.
      const gapFrom = this.newestReadingTs();
      this.cache.clear();
      await this.client.subscribe('subscribe_entities', { entity_ids: this.entityIds }, (event) =>
        this.onEntitiesEvent(event as EntitiesEvent),
      );
      if (gapFrom !== null) await this.fillGap(gapFrom);
      if (this.backfill.state === 'idle') await this.runBackfill();
    } catch (err) {
      console.error('[collector] setup after connect failed:', (err as Error).message);
    }
  }

  private onEntitiesEvent(event: EntitiesEvent): void {
    const now = Date.now();
    let stored = 0;
    for (const u of applyEntitiesEvent(this.cache, event, now)) {
      const key = this.keyByEntity.get(u.entityId);
      if (!key) continue;
      const result = ingest(this.store, { key, entityId: u.entityId, ts: u.ts, state: u.state, attrs: u.attrs }, 'live');
      if (result === 'stored') stored++;
    }
    if (stored) this.emit();
  }

  private newestReadingTs(): number | null {
    const latest = SENSOR_KEYS.map((k) => this.store.latest(k)?.ts).filter((t): t is number => t !== undefined);
    return latest.length ? Math.max(...latest) : null; // null: the backfill covers it
  }

  /** After a (re)connect: fetch everything since the last stored reading. */
  private async fillGap(from: number): Promise<void> {
    const stored = await this.importHistory(from, Date.now(), 'history');
    if (stored) {
      console.log(`[collector] filled gap with ${stored} readings`);
      this.emit();
    }
  }

  /** Start (or restart) the backfill. Resolves when it is finished. */
  async runBackfill(): Promise<void> {
    if (this.backfill.state === 'running') return;
    this.backfill = {
      state: 'running',
      step: 'statistics',
      stored: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
    try {
      const odometer = [...this.keyByEntity].find(([, k]) => k === 'odometer')?.[0];
      if (odometer) this.backfill.stored += await this.importStatistics(odometer);
      this.backfill.step = 'history';
      this.backfill.stored += await this.importHistoryBackwards();
      // Derived data (totals, levels, milestones) is computed on demand from
      // the readings, so it is automatically up to date after the backfill.
      this.backfill.state = 'done';
      this.backfill.step = null;
      this.backfill.finishedAt = new Date().toISOString();
      this.setMeta('backfill_done_at', this.backfill.finishedAt);
      console.log(`[collector] backfill done: ${this.backfill.stored} readings stored`);
    } catch (err) {
      this.backfill.state = 'error';
      this.backfill.error = (err as Error).message;
      console.error('[collector] backfill failed:', this.backfill.error);
    }
    this.emit();
  }

  /** Long-term statistics (hourly) for the odometer, in 30-day chunks. */
  private async importStatistics(statisticId: string): Promise<number> {
    const types = ['max', 'mean', 'state'];
    const units = { distance: 'km' };
    const monthly = await this.client.call<Record<string, StatRow[]>>('recorder/statistics_during_period', {
      start_time: iso(Date.UTC(2000, 0, 1)),
      statistic_ids: [statisticId],
      period: 'month',
      types,
      units,
    });
    const first = monthly[statisticId]?.[0];
    if (!first) return 0;

    let stored = 0;
    const now = Date.now();
    for (let from = toMs(first.start); from < now; from += STATS_CHUNK_DAYS * DAY) {
      const to = Math.min(now, from + STATS_CHUNK_DAYS * DAY);
      const res = await this.client.call<Record<string, StatRow[]>>('recorder/statistics_during_period', {
        start_time: iso(from),
        end_time: iso(to),
        statistic_ids: [statisticId],
        period: 'hour',
        types,
        units,
      });
      stored += this.store.transaction(() => {
        let n = 0;
        for (const row of res[statisticId] ?? []) {
          const value = row.max ?? row.state ?? row.mean;
          if (value === null || value === undefined) continue;
          const result = ingest(
            this.store,
            {
              key: 'odometer',
              entityId: statisticId,
              ts: toMs(row.end) - 1000,
              state: String(value),
              attrs: { unit_of_measurement: 'km' },
            },
            'statistics',
          );
          if (result === 'stored') n++;
        }
        return n;
      });
    }
    return stored;
  }

  /** Raw history, walking back in weekly chunks until the recorder runs out. */
  private async importHistoryBackwards(): Promise<number> {
    let stored = 0;
    let emptyChunks = 0;
    const now = Date.now();
    for (let to = now, days = 0; days < HISTORY_MAX_DAYS; days += HISTORY_CHUNK_DAYS) {
      const from = to - HISTORY_CHUNK_DAYS * DAY;
      const { received, stored: n } = await this.importHistoryChunk(from, to, 'history');
      stored += n;
      emptyChunks = received === 0 ? emptyChunks + 1 : 0;
      if (emptyChunks >= HISTORY_EMPTY_CHUNKS_TO_STOP) break;
      to = from;
    }
    return stored;
  }

  private async importHistory(from: number, to: number, source: ReadingSource): Promise<number> {
    let stored = 0;
    for (let start = from; start < to; start += HISTORY_CHUNK_DAYS * DAY) {
      const end = Math.min(to, start + HISTORY_CHUNK_DAYS * DAY);
      stored += (await this.importHistoryChunk(start, end, source)).stored;
    }
    return stored;
  }

  private async importHistoryChunk(
    from: number,
    to: number,
    source: ReadingSource,
  ): Promise<{ received: number; stored: number }> {
    const res = await this.client.call<Record<string, CompressedState[]>>('history/history_during_period', {
      start_time: iso(from),
      end_time: iso(to),
      entity_ids: this.entityIds,
      include_start_time_state: false,
      significant_changes_only: false,
      minimal_response: false,
      no_attributes: false,
    });
    let received = 0;
    const stored = this.store.transaction(() => {
      let n = 0;
      for (const [entityId, states] of Object.entries(res ?? {})) {
        const key = this.keyByEntity.get(entityId);
        if (!key) continue;
        // Sort by time so odometer validation sees values in order.
        const sorted = [...states].sort((a, b) => stateTimestamp(a, 0) - stateTimestamp(b, 0));
        for (const s of sorted) {
          received++;
          const ts = stateTimestamp(s, from);
          const result = ingest(this.store, { key, entityId, ts, state: String(s.s ?? ''), attrs: s.a ?? null }, source);
          if (result === 'stored') n++;
        }
      }
      return n;
    });
    return { received, stored };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }
}
