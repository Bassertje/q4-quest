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
  type GreenTotals,
  dayKey,
  shiftPeriod,
  weekKey,
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
  /** CO₂ saved, litres not burned and trees (estimates). */
  green: GreenTotals | null;
  /** Charged kWh per ISO week (AC and DC), fixed window of 12 weeks ending this week. */
  weeklyKwh: { week: string; ac: number; dc: number; beforeStart: boolean }[];
  /** SoC readings of the last 7 days (empty without a SoC sensor). */
  socLast7d: [number, number][];
  /** Progress towards the next CO₂ badge of the Groen category. */
  nextGreen: { name: string; icon: string; current: number; target: number; unit: string } | null;
}

const WEEK_WINDOW = 12;
const CO2_BADGES = ['green_start', 'first_ton', 'climate_champion'];

export function chargingResponse(state: GameState, options: Options): ChargingResponse {
  const available = chargingAvailable(options);
  const { timeZone, now } = state;
  const empty = {
    available, timeZone, batteryKwh: options.batteryKwh, sessions: [], totals: null, consumption: null, records: null, green: null,
    weeklyKwh: [], socLast7d: [], nextGreen: null,
  };
  if (!available) return empty;
  const sessions = state.sessions;
  return {
    ...empty,
    sessions: [...sessions].reverse(),
    totals: chargingTotals(sessions),
    consumption: options.entities.odometer ? consumptionEstimate(state.energy, now) : null,
    records: state.chargingRecords,
    green: state.green,
    weeklyKwh: weeklyKwh(state),
    socLast7d: state.energy.soc.filter((r) => r.ts >= now - 7 * 86_400_000).map((r): [number, number] => [r.ts, r.value]),
    nextGreen: nextGreenBadge(state),
  };
}

function nextGreenBadge(state: GameState): ChargingResponse['nextGreen'] {
  const b = CO2_BADGES.map((id) => state.badges.find((x) => x.id === id)).find((x) => x && x.unlockedTs === null && x.progress);
  return b ? { name: b.name, icon: b.icon, ...b.progress! } : null;
}

/** Charged kWh per ISO week for the last 12 weeks (AC and DC separately). */
function weeklyKwh(state: GameState): ChargingResponse['weeklyKwh'] {
  const current = weekKey(dayKey(state.now, state.timeZone));
  const first = state.odometer[0] ? weekKey(dayKey(state.odometer[0].ts, state.timeZone)) : current;
  const out: ChargingResponse['weeklyKwh'] = [];
  for (let i = WEEK_WINDOW - 1; i >= 0; i--) {
    const week = shiftPeriod('week', current, -i);
    out.push({ week, ac: 0, dc: 0, beforeStart: week < first });
  }
  for (const s of state.sessions) {
    if (s.kwh === null || s.ongoing) continue;
    const row = out.find((r) => r.week === weekKey(dayKey(s.start, state.timeZone)));
    if (row) row[s.type === 'DC' ? 'dc' : 'ac'] += s.kwh;
  }
  for (const r of out) {
    r.ac = Math.round(r.ac * 10) / 10;
    r.dc = Math.round(r.dc * 10) / 10;
  }
  return out;
}
