import {
  dayKey,
  describeChallenge,
  historyPeriodView,
  type HistoryPeriodView,
  type ViewPeriodMode,
  temperatureAt,
  type ChallengeResult,
  type ChargingRecords,
  type History,
  type MonthStats,
  type TripBlock,
} from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';

/** How many of the most recent trip blocks of a period are sent to the browser. */
const PERIOD_TRIPS = 100;

export interface HistoryResponse {
  setupNeeded: boolean;
  timeZone: string;
  history: Omit<History, 'trips'> | null;
  /** Tiles, chart and trip blocks of the chosen period (null without odometer data). */
  period: (Omit<HistoryPeriodView, 'trips'> & { trips: (TripBlock & { startTemp: number | null })[] }) | null;
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

export function historyResponse(state: GameState, mode: ViewPeriodMode, key: string | null): HistoryResponse {
  const { setupNeeded, timeZone, chargingRecords } = state;
  const hasTemperature = state.temperature.length > 0;
  const extra = {
    chargingRecords,
    monthly: state.monthly,
    dailyTemps: [...state.dailyTemps],
    hasTemperature,
    challenges: [...state.challenges].reverse().map((c) => ({ ...c, ...describeChallenge(c.type, c.target) })),
  };
  if (!state.history) return { setupNeeded, timeZone, history: null, period: null, ...extra };
  const { trips, ...rest } = state.history;
  const view = historyPeriodView(
    { daily: rest.daily, trips, tripDay: (t) => dayKey(t.start, timeZone), today: dayKey(state.now, timeZone) },
    mode,
    key,
    PERIOD_TRIPS,
  );
  const period = {
    ...view,
    trips: view.trips.map((t) => ({ ...t, startTemp: hasTemperature ? temperatureAt(state.temperature, t.start) : null })),
  };
  return { setupNeeded, timeZone, history: rest, period, ...extra };
}
