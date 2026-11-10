import {
  chargingRecords,
  chargingSessions,
  chargingTotals,
  consumptionEstimate,
  toKw,
  type ChargingRecords,
  type ChargingSession,
  type ChargingTotals,
  type ConsumptionEstimate,
} from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';
import type { Options } from './options.ts';
import type { ReadingStore } from './readings.ts';

/** Charging features need a charging power or charging state sensor. */
export function chargingAvailable(options: Options): boolean {
  return options.entities.charging_power !== null || options.entities.charging_state !== null;
}

/** All charging sessions, oldest first. */
export function loadSessions(store: ReadingStore, options: Options, now = Date.now()): ChargingSession[] {
  if (!chargingAvailable(options)) return [];
  const e = options.entities;
  return chargingSessions({
    power: e.charging_power ? store.seriesWithUnit('charging_power').map((r) => ({ ts: r.ts, kw: toKw(r.value, r.unit) })) : [],
    state: e.charging_state ? store.states('charging_state') : [],
    type: e.charging_type ? store.states('charging_type') : [],
    soc: e.soc ? store.series('soc') : [],
    hasSoc: e.soc !== null,
    batteryKwh: options.batteryKwh,
    now,
  });
}

export interface ChargingResponse {
  available: boolean;
  timeZone: string;
  batteryKwh: number;
  /** Newest first. */
  sessions: ChargingSession[];
  totals: ChargingTotals | null;
  consumption: ConsumptionEstimate | null;
  records: ChargingRecords | null;
}

export function chargingResponse(state: GameState, options: Options): ChargingResponse {
  const available = chargingAvailable(options);
  const { timeZone, now } = state;
  const empty = { available, timeZone, batteryKwh: options.batteryKwh, sessions: [], totals: null, consumption: null, records: null };
  if (!available) return empty;
  const sessions = state.sessions;
  return {
    ...empty,
    sessions: [...sessions].reverse(),
    totals: chargingTotals(sessions),
    consumption: options.entities.odometer ? consumptionEstimate(sessions, state.dailyTotals, now, timeZone) : null,
    records: state.chargingRecords,
  };
}
