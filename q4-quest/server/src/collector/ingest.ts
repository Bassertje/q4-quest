import type { SensorKey } from '../options.ts';
import type { ReadingSource, ReadingStore } from '../readings.ts';
import { pickAttrs, validateReading } from './validate.ts';

export interface RawState {
  key: SensorKey;
  entityId: string;
  ts: number;
  state: string;
  attrs: Record<string, unknown> | null;
}

export type IngestResult = 'stored' | 'duplicate' | 'rejected';

/** Validate and store one state; logs rejected odometer values. */
export function ingest(store: ReadingStore, input: RawState, source: ReadingSource): IngestResult {
  const raw = { ...input, ts: Math.round(input.ts) };
  let previous: { ts: number; value: number } | null = null;
  if (raw.key === 'odometer') {
    const prev = store.before('odometer', raw.ts);
    if (prev) previous = { ts: prev.ts, value: Number(prev.value) };
  }
  const verdict = validateReading(raw.key, raw.state, raw.attrs, raw.ts, previous);
  if (!verdict.ok) {
    if (verdict.reason.startsWith('odometer_')) {
      console.warn(
        `[collector] ignored odometer value ${raw.state} at ${new Date(raw.ts).toISOString()} (${verdict.reason})`,
      );
    }
    return 'rejected';
  }
  const stored = store.insert({
    key: raw.key,
    entityId: raw.entityId,
    ts: raw.ts,
    value: verdict.value,
    attrs: pickAttrs(raw.attrs),
    source,
  });
  return stored ? 'stored' : 'duplicate';
}
