import {
  chargingSessions,
  toKw,
  type ChargingRecords,
  type ChargingSession,
  type ChargePeriodMode,
  type ChargePeriodView,
  chargePeriodView,
  dayKey,
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
  /** Tiles, chart and sessions of the chosen period. */
  period: ChargePeriodView | null;
  hasSoc: boolean;
  records: ChargingRecords | null;
  /** All-time CO₂ saved and the next CO₂ badge of the Groen category (null: all reached). */
  greenProgress: {
    totalKg: number;
    next: { name: string; icon: string; current: number; target: number; unit: string } | null;
  } | null;
}

const CO2_BADGES = ['green_start', 'first_ton', 'climate_champion'];

export function chargingResponse(state: GameState, options: Options, mode: ChargePeriodMode, key: string | null): ChargingResponse {
  const available = chargingAvailable(options);
  const { timeZone, now } = state;
  const empty: ChargingResponse = {
    available, timeZone, batteryKwh: options.batteryKwh, period: null, hasSoc: options.entities.soc !== null,
    records: null, greenProgress: null,
  };
  if (!available) return empty;
  const sessions = state.sessions;
  const firstTs = Math.min(state.odometer[0]?.ts ?? Infinity, sessions[0]?.start ?? Infinity, now);
  return {
    ...empty,
    period: chargePeriodView(
      {
        sessions,
        energy: options.entities.odometer ? state.energy : { ...state.energy, odometer: [] },
        firstDay: dayKey(firstTs, timeZone),
        timeZone,
        now,
        green: {
          co2PetrolKgPerKm: options.co2PetrolKgPerKm,
          co2GridKgPerKwh: options.co2GridKgPerKwh,
          petrolLPer100km: options.petrolLPer100km,
        },
        greenAll: state.green,
      },
      mode,
      key,
    ),
    records: state.chargingRecords,
    greenProgress: greenProgress(state),
  };
}

function greenProgress(state: GameState): ChargingResponse['greenProgress'] {
  if (!state.green || state.green.co2Kg === null) return null;
  const b = CO2_BADGES.map((id) => state.badges.find((x) => x.id === id)).find((x) => x && x.unlockedTs === null && x.progress);
  const totalKg = state.green.co2Kg;
  // Use the same total as the "Alles" Groen figures, so the label and the bar agree.
  return { totalKg, next: b ? { name: b.name, icon: b.icon, ...b.progress!, current: Math.min(totalKg, b.progress!.target) } : null };
}

export const SOC_RANGES = { '24h': 1, '7d': 7, '30d': 30 } as const;
export type SocRange = keyof typeof SOC_RANGES;
export const isSocRange = (v: unknown): v is SocRange => typeof v === 'string' && v in SOC_RANGES;

export interface SocResponse {
  range: SocRange;
  from: number;
  to: number;
  /** SoC readings in the range, plus the last one before it (empty without a SoC sensor). */
  soc: [number, number][];
  /** Sessions overlapping the range (shaded in the chart). */
  sessions: { start: number; end: number; type: 'AC' | 'DC' }[];
}

/** SoC timeline for the last 24 hours, 7 days or 30 days. */
export function socResponse(state: GameState, range: SocRange): SocResponse {
  const to = state.now;
  const from = to - SOC_RANGES[range] * 86_400_000;
  const all = state.energy.soc;
  const firstIn = all.findIndex((r) => r.ts >= from);
  const rows = firstIn === -1 ? all.slice(-1) : all.slice(Math.max(0, firstIn - 1));
  return {
    range,
    from,
    to,
    soc: rows.map((r): [number, number] => [Math.max(r.ts, from), r.value]),
    sessions: state.sessions.filter((s) => s.end >= from).map((s) => ({ start: s.start, end: s.end, type: s.type })),
  };
}
