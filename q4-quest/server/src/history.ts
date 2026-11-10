import { buildHistory, chargingRecords, type ChargingRecords, type History } from '../../game/src/index.ts';
import { chargingAvailable, loadSessions } from './charging.ts';
import type { Options } from './options.ts';
import type { ReadingStore } from './readings.ts';

/** How many of the most recent trip blocks are sent to the browser. */
const RECENT_TRIPS = 20;

export interface HistoryResponse {
  setupNeeded: boolean;
  timeZone: string;
  history: (Omit<History, 'trips'> & { recentTrips: History['trips'] }) | null;
  /** Charging records, only when charging sensors are configured. */
  chargingRecords: ChargingRecords | null;
}

export function historyResponse(
  store: ReadingStore,
  options: Options,
  timeZone: string,
  now = Date.now(),
): HistoryResponse {
  const setupNeeded = options.entities.odometer === null;
  if (setupNeeded) return { setupNeeded, timeZone, history: null, chargingRecords: null };
  const charging = chargingAvailable(options) ? chargingRecords(loadSessions(store, options, now), timeZone) : null;
  const history = buildHistory({
    odometer: store.series('odometer'),
    // The parking brake only helps when it is configured.
    parkingBrake: options.entities.parking_brake ? store.states('parking_brake') : [],
    now,
    timeZone,
  });
  if (!history) return { setupNeeded, timeZone, history: null, chargingRecords: charging };
  const { trips, ...rest } = history;
  return { setupNeeded, timeZone, history: { ...rest, recentTrips: trips.slice(-RECENT_TRIPS).reverse() }, chargingRecords: charging };
}
