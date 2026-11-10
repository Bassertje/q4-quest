import {
  describeChallenge,
  temperatureAt,
  type ChallengeResult,
  type ChargingRecords,
  type History,
  type MonthStats,
  type TripBlock,
} from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';

/** How many of the most recent trip blocks are sent to the browser. */
const RECENT_TRIPS = 20;

export interface HistoryResponse {
  setupNeeded: boolean;
  timeZone: string;
  history: (Omit<History, 'trips'> & { recentTrips: (TripBlock & { startTemp: number | null })[] }) | null;
  /** Charging records, only when charging sensors are configured. */
  chargingRecords: ChargingRecords | null;
  /** Consumption and average temperature per month (only with charging sensors). */
  monthly: MonthStats[];
  /** Daily average temperature (only with a temperature sensor). */
  dailyTemps: [string, number][];
  hasTemperature: boolean;
  /** All weekly challenges, newest first. */
  challenges: (ChallengeResult & { title: string; goal: string; unit: string })[];
}

export function historyResponse(state: GameState): HistoryResponse {
  const { setupNeeded, timeZone, chargingRecords } = state;
  const hasTemperature = state.temperature.length > 0;
  const extra = {
    chargingRecords,
    monthly: state.monthly,
    dailyTemps: [...state.dailyTemps],
    hasTemperature,
    challenges: [...state.challenges].reverse().map((c) => ({ ...c, ...describeChallenge(c.type, c.target) })),
  };
  if (!state.history) return { setupNeeded, timeZone, history: null, ...extra };
  const { trips, ...rest } = state.history;
  const recentTrips = trips
    .slice(-RECENT_TRIPS)
    .reverse()
    .map((t) => ({ ...t, startTemp: hasTemperature ? temperatureAt(state.temperature, t.start) : null }));
  return { setupNeeded, timeZone, history: { ...rest, recentTrips }, ...extra };
}
