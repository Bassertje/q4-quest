import { ingest } from '../collector/ingest.ts';
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
