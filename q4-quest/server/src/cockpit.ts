import { pickFollowedBadge, type Cockpit } from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';
import type { Options, SensorKey } from './options.ts';
import type { ReadingStore } from './readings.ts';

export interface CockpitResponse {
  setupNeeded: boolean;
  timeZone: string;
  cockpit: Cockpit | null;
  soc: { value: number; ts: number } | null;
  range: { value: number; ts: number } | null;
  /** The followed badge: the user's choice, or picked automatically. */
  followed: {
    id: string;
    name: string;
    icon: string;
    auto: boolean;
    current: number;
    target: number;
    unit: string;
    remaining: number;
  } | null;
}

function latestNumber(store: ReadingStore, options: Options, key: SensorKey) {
  if (!options.entities[key]) return null; // hidden when the sensor is not configured
  const r = store.latest(key);
  const value = Number(r?.value);
  return r && Number.isFinite(value) ? { value, ts: r.ts } : null;
}

export function cockpitResponse(
  state: GameState,
  store: ReadingStore,
  options: Options,
  followedId: string | null = null,
): CockpitResponse {
  const f = pickFollowedBadge(state.badges, followedId);
  return {
    followed: f
      ? {
          id: f.badge.id,
          name: f.badge.name,
          icon: f.badge.icon,
          auto: f.auto,
          current: f.badge.progress!.current,
          target: f.badge.progress!.target,
          unit: f.badge.progress!.unit,
          remaining: f.remaining,
        }
      : null,
    setupNeeded: state.setupNeeded,
    timeZone: state.timeZone,
    cockpit: state.cockpit,
    soc: latestNumber(store, options, 'soc'),
    range: latestNumber(store, options, 'range'),
  };
}
