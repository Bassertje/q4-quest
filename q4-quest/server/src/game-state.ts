import {
  buildCockpit,
  buildHistory,
  chargingRecords,
  dailyTotals,
  evaluateBadges,
  tripBlocks,
  type BadgeResult,
  type ChargingRecords,
  type ChargingSession,
  type Cockpit,
  type History,
  type Requirement,
  type TimedValue,
} from '../../game/src/index.ts';
import { chargingAvailable, loadSessions } from './charging.ts';
import type { Options } from './options.ts';
import type { ReadingStore } from './readings.ts';

/** Everything derived from the readings, computed in one go. */
export interface GameState {
  setupNeeded: boolean;
  timeZone: string;
  now: number;
  odometer: TimedValue[];
  dailyTotals: Map<string, number>;
  /** All charging sessions (including an ongoing one), oldest first. */
  sessions: ChargingSession[];
  badges: BadgeResult[];
  history: History | null;
  cockpit: Cockpit | null;
  chargingRecords: ChargingRecords | null;
}

/** Which badge requirements the configured sensors satisfy. */
export function availableRequirements(options: Options): Set<Requirement> {
  const out = new Set<Requirement>();
  if (options.entities.odometer) out.add('odometer');
  if (options.entities.soc) out.add('soc');
  if (chargingAvailable(options)) out.add('charging');
  return out;
}

/**
 * Derive everything from the raw readings. Nothing derived is stored, so a new
 * version of the add-on (e.g. a changed session definition) automatically
 * recalculates sessions, badges and unlock dates.
 */
export function computeGameState(store: ReadingStore, options: Options, timeZone: string, now: number): GameState {
  const setupNeeded = options.entities.odometer === null;
  const odometer = setupNeeded ? [] : store.series('odometer');
  const totals = dailyTotals(odometer, timeZone);
  const sessions = loadSessions(store, options, now);
  // The parking brake only helps when it is configured.
  const trips = setupNeeded
    ? []
    : tripBlocks(odometer, options.entities.parking_brake ? store.states('parking_brake') : []);
  const badges = setupNeeded
    ? []
    : evaluateBadges({
        odometer,
        dailyTotals: totals,
        trips,
        sessions: sessions.filter((s) => !s.ongoing),
        soc: options.entities.soc ? store.series('soc') : [],
        timeZone,
        now,
        available: availableRequirements(options),
      });
  // The timeline includes badges, and their bonus XP dates the level-ups.
  const history = setupNeeded ? null : buildHistory({ odometer, trips, now, timeZone, badges });
  return {
    setupNeeded,
    timeZone,
    now,
    odometer,
    dailyTotals: totals,
    sessions,
    badges,
    history,
    cockpit: setupNeeded ? null : buildCockpit({ odometer, now, timeZone, badges }),
    chargingRecords: chargingAvailable(options) ? chargingRecords(sessions, timeZone) : null,
  };
}

const CACHE_MS = 60_000;

/** Caches the game state until new readings arrive or a minute has passed. */
export class GameStateCache {
  private key = '';
  private state: GameState | null = null;
  private store: ReadingStore;
  private options: Options;

  constructor(store: ReadingStore, options: Options) {
    this.store = store;
    this.options = options;
  }

  get(timeZone: string, now = Date.now()): GameState {
    const key = `${this.store.revision}|${timeZone}|${Math.floor(now / CACHE_MS)}`;
    if (!this.state || key !== this.key) {
      this.state = computeGameState(this.store, this.options, timeZone, now);
      this.key = key;
    }
    return this.state;
  }
}
