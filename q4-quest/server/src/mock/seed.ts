import type { DatabaseSync } from 'node:sqlite';
import { isoWeekStart, shiftPeriod, weekKey, zonedMidnight, dayKey } from '../../../game/src/index.ts';
import { ingest } from '../collector/ingest.ts';
import { computeGameState } from '../game-state.ts';
import type { Options } from '../options.ts';
import type { ReadingStore } from '../readings.ts';
import { generateMockHistory } from './generate.ts';

export const MOCK_DAYS = 120;

/** Fill the store with generated history through the normal ingest path. */
export function seedMockData(store: ReadingStore, options: Options, now = Date.now()): number {
  const readings = generateMockHistory({ batteryKwh: options.batteryKwh, days: MOCK_DAYS, endTs: now });
  return store.transaction(() => {
    let stored = 0;
    for (const r of readings) {
      const entityId = options.entities[r.key];
      if (!entityId) continue;
      const result = ingest(store, { key: r.key, entityId, ts: r.ts, state: r.value, attrs: r.attrs }, 'mock');
      if (result === 'stored') stored++;
    }
    return stored;
  });
}

/**
 * Mock mode only: replay the past weeks as if the app had been running, so
 * the weekly challenge history is visible. Real installations never get
 * challenges for weeks before the app was opened.
 */
export function seedMockChallenges(store: ReadingStore, options: Options, db: DatabaseSync, timeZone: string, now = Date.now()): void {
  const first = store.series('odometer')[0];
  if (!first) return;
  const thisWeek = weekKey(dayKey(now, timeZone));
  // Start in the first week that has 4 weeks of history before it… or earlier, with start values.
  let week = shiftPeriod('week', weekKey(dayKey(first.ts, timeZone)), 1);
  while (week < thisWeek) {
    const monday = zonedMidnight(isoWeekStart(week), timeZone);
    computeGameState(store, options, timeZone, monday + 60_000, db);
    week = shiftPeriod('week', week, 1);
  }
}
