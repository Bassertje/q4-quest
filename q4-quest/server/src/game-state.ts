import type { DatabaseSync } from 'node:sqlite';
import {
  buildCockpit,
  buildWeekReview,
  dailyTemperatures,
  dayKey,
  dayProgress,
  greenTotals,
  monthlyStats,
  shiftPeriod,
  weekBounds,
  weekKey,
  type ChallengeResult,
  type GreenTotals,
  type MonthStats,
  type WeekReview,
  periodEnergy,
  type EnergyInput,
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
import { challengeBonusBadges, syncChallenges } from './challenges.ts';
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
  /** Weekly challenges, oldest first (stored in the database). */
  challenges: ChallengeResult[];
  /** Outdoor temperature (°C); empty without a temperature sensor. */
  temperature: TimedValue[];
  dailyTemps: Map<string, number>;
  monthly: MonthStats[];
  green: GreenTotals | null;
  /** "Last week" card for the reveal (null before the first full week). */
  weekReview: WeekReview | null;
  /** Inputs for energy-based consumption estimates. */
  energy: EnergyInput;
}

/**
 * Never take a badge away: badges unlocked now are recorded; a badge that was
 * recorded before but is no longer confirmed (e.g. after a changed
 * calculation) keeps its recorded date.
 */
export function keepEarnedBadges(db: DatabaseSync, badges: BadgeResult[]): BadgeResult[] {
  const stored = new Map(
    (db.prepare('SELECT id, unlocked_ts FROM earned_badges').all() as { id: string; unlocked_ts: number }[]).map((r) => [r.id, r.unlocked_ts]),
  );
  const upsert = db.prepare(
    'INSERT INTO earned_badges (id, unlocked_ts) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET unlocked_ts = excluded.unlocked_ts',
  );
  return badges.map((b) => {
    const known = stored.get(b.id);
    if (b.unlockedTs !== null) {
      if (known !== b.unlockedTs) upsert.run(b.id, b.unlockedTs);
      return b;
    }
    return known !== undefined ? { ...b, unlockedTs: known } : b;
  });
}

/** Which badge requirements the configured sensors satisfy. */
export function availableRequirements(options: Options): Set<Requirement> {
  const out = new Set<Requirement>();
  if (options.entities.odometer) out.add('odometer');
  if (options.entities.soc) out.add('soc');
  if (chargingAvailable(options)) out.add('charging');
  if (options.entities.temperature) out.add('temperature');
  return out;
}

/**
 * Derive everything from the raw readings. Derived data is not stored (only
 * the weekly challenges, which are chosen once per week), so a new version of
 * the add-on automatically recalculates sessions, badges and unlock dates.
 */
export function computeGameState(
  store: ReadingStore,
  options: Options,
  timeZone: string,
  now: number,
  db: DatabaseSync,
): GameState {
  const setupNeeded = options.entities.odometer === null;
  const charging = chargingAvailable(options);
  const odometer = setupNeeded ? [] : store.series('odometer');
  const totals = dailyTotals(odometer, timeZone);
  const sessions = loadSessions(store, options, now);
  const finished = sessions.filter((s) => !s.ongoing);
  const temperature = options.entities.temperature ? store.series('temperature') : [];
  const dailyTemps = dailyTemperatures(temperature, timeZone);
  const factors = {
    co2PetrolKgPerKm: options.co2PetrolKgPerKm,
    co2GridKgPerKwh: options.co2GridKgPerKwh,
    petrolLPer100km: options.petrolLPer100km,
  };
  const progress = dayProgress(odometer, timeZone);
  const soc = options.entities.soc ? store.series('soc') : [];
  const energy: EnergyInput = { odometer, soc, sessions: finished, batteryKwh: options.batteryKwh, hasSoc: options.entities.soc !== null };
  const weekConsumption = (week: string) => {
    const { start, end } = weekBounds(week, timeZone);
    return periodEnergy(energy, start, Math.min(end, now + 1))?.kwhPer100km ?? null;
  };

  const challenges = setupNeeded
    ? []
    : syncChallenges(db, {
        progress,
        dailyTotals: totals,
        sessions,
        timeZone,
        now,
        firstTs: odometer[0]?.ts ?? null,
        charging,
        weekConsumption,
      });

  // The parking brake only helps when it is configured.
  const trips = setupNeeded
    ? []
    : tripBlocks(odometer, options.entities.parking_brake ? store.states('parking_brake') : []);
  const badges = setupNeeded
    ? []
    : [
        ...keepEarnedBadges(db, evaluateBadges({
          odometer,
          dailyTotals: totals,
          trips,
          sessions: finished,
          soc,
          temperature,
          green: factors,
          batteryKwh: options.batteryKwh,
          hasSoc: options.entities.soc !== null,
          challenges: challenges
            .filter((c) => c.status === 'done' && c.completedTs !== null)
            .map((c) => ({ week: c.week, completedTs: c.completedTs! })),
          timeZone,
          now,
          available: availableRequirements(options),
        })),
        ...challengeBonusBadges(challenges),
      ];
  // The timeline includes badges, and their bonus XP dates the level-ups.
  const history = setupNeeded ? null : buildHistory({ odometer, trips, now, timeZone, badges });
  const records = charging ? chargingRecords(sessions, timeZone) : null;

  // Weekly review: only once a full week of measurement lies behind us.
  const thisWeek = weekKey(dayKey(now, timeZone));
  const lastWeek = shiftPeriod('week', thisWeek, -1);
  const weekReview =
    !setupNeeded && odometer[0] && odometer[0].ts < weekBounds(thisWeek, timeZone).start
      ? buildWeekReview({
          week: lastWeek,
          dailyTotals: totals,
          sessions: charging ? finished : null,
          records: history?.records ?? null,
          chargingRecords: records,
          challenge: challenges.find((c) => c.week === lastWeek) ?? null,
          timeZone,
        })
      : null;

  const totalKm = [...totals.values()].reduce((a, b) => a + b, 0);
  const totalKwh = finished.reduce((a, s) => a + (s.kwh ?? 0), 0);
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
    chargingRecords: records,
    challenges,
    temperature,
    dailyTemps,
    monthly: charging ? monthlyStats(totals, energy, dailyTemps, timeZone, now) : [],
    green: setupNeeded ? null : greenTotals(totalKm, charging ? (periodEnergy(energy, 0, now + 1)?.usedKwh ?? totalKwh) : null, factors),
    energy,
    weekReview,
  };
}

const CACHE_MS = 60_000;

/** Caches the game state until new readings arrive or a minute has passed. */
export class GameStateCache {
  private key = '';
  private state: GameState | null = null;
  private store: ReadingStore;
  private options: Options;
  private db: DatabaseSync;

  constructor(store: ReadingStore, options: Options, db: DatabaseSync) {
    this.store = store;
    this.options = options;
    this.db = db;
  }

  get(timeZone: string, now = Date.now()): GameState {
    const key = `${this.store.revision}|${timeZone}|${Math.floor(now / CACHE_MS)}`;
    if (!this.state || key !== this.key) {
      this.state = computeGameState(this.store, this.options, timeZone, now, this.db);
      this.key = key;
    }
    return this.state;
  }
}
