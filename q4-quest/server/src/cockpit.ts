import type { Cockpit } from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';
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

export function cockpitResponse(state: GameState, store: ReadingStore, options: Options): CockpitResponse {
  return {
    setupNeeded: state.setupNeeded,
    timeZone: state.timeZone,
    cockpit: state.cockpit,
    soc: latestNumber(store, options, 'soc'),
    range: latestNumber(store, options, 'range'),
  };
}
