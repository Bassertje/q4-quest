import { buildCockpit, type Cockpit } from '../../game/src/index.ts';
import type { Options, SensorKey } from './options.ts';
import type { ReadingStore } from './readings.ts';

export interface CockpitResponse {
  setupNeeded: boolean;
  timeZone: string;
  cockpit: Cockpit | null;
  soc: { value: number; ts: number } | null;
  range: { value: number; ts: number } | null;
}

function latestNumber(store: ReadingStore, options: Options, key: SensorKey) {
  if (!options.entities[key]) return null; // hidden when the sensor is not configured
  const r = store.latest(key);
  const value = Number(r?.value);
  return r && Number.isFinite(value) ? { value, ts: r.ts } : null;
}

export function cockpitResponse(
  store: ReadingStore,
  options: Options,
  timeZone: string,
  now = Date.now(),
): CockpitResponse {
  const setupNeeded = options.entities.odometer === null;
  return {
    setupNeeded,
    timeZone,
    cockpit: setupNeeded ? null : buildCockpit({ odometer: store.series('odometer'), now, timeZone }),
    soc: latestNumber(store, options, 'soc'),
    range: latestNumber(store, options, 'range'),
  };
}
