import type { ChargingRecords, History } from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';

/** How many of the most recent trip blocks are sent to the browser. */
const RECENT_TRIPS = 20;

export interface HistoryResponse {
  setupNeeded: boolean;
  timeZone: string;
  history: (Omit<History, 'trips'> & { recentTrips: History['trips'] }) | null;
  /** Charging records, only when charging sensors are configured. */
  chargingRecords: ChargingRecords | null;
}

export function historyResponse(state: GameState): HistoryResponse {
  const { setupNeeded, timeZone, chargingRecords } = state;
  if (!state.history) return { setupNeeded, timeZone, history: null, chargingRecords };
  const { trips, ...rest } = state.history;
  return { setupNeeded, timeZone, history: { ...rest, recentTrips: trips.slice(-RECENT_TRIPS).reverse() }, chargingRecords };
}
