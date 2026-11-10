import type { ChargingSession } from './charging.ts';
import { STREAK_MIN_KM } from './distance.ts';
import { isoWeekStart, shiftPeriod } from './periods.ts';
import { dayReachTimes, firstGroupCrossing, type DayProgress } from './progress.ts';
import { addDays, dayKey, weekKey, zonedMidnight } from './time.ts';

export type ChallengeType = 'km' | 'days' | 'max_charges' | 'consumption';

export interface Challenge {
  week: string;
  type: ChallengeType;
  target: number;
}

export type ChallengeStatus = 'active' | 'done' | 'missed';

export interface ChallengeResult extends Challenge {
  status: ChallengeStatus;
  /** Current value: km, driving days, sessions or kWh/100 km (null when unknown). */
  current: number | null;
  /** Moment the challenge was completed. */
  completedTs: number | null;
}

/** Bonus XP for a completed challenge. */
export const CHALLENGE_XP = 100;
/** Fixed starting targets when there is not enough history. */
export const START_TARGETS: Record<ChallengeType, number> = { km: 200, days: 4, max_charges: 3, consumption: 18 };
/** Weeks of history used to derive a target. */
export const HISTORY_WEEKS = 4;
/** A consumption challenge needs at least this much driving in the week. */
export const CONSUMPTION_CHALLENGE_MIN_KM = 100;

export interface WeekStats {
  week: string;
  km: number;
  days: number;
  sessions: number;
  kwh: number;
  consumption: number | null;
}

const inWeek = (week: string) => (day: string) => weekKey(day) === week;

/** Driving and charging figures for one ISO week. */
export function weekStats(
  week: string,
  dailyTotals: Map<string, number>,
  sessions: ChargingSession[],
  timeZone: string,
  /** Weekly consumption with the energy method (used energy ÷ km); falls back to charged ÷ km. */
  weekConsumption?: (week: string) => number | null,
): WeekStats {
  const days = [...dailyTotals].filter(([d]) => inWeek(week)(d));
  const km = days.reduce((s, [, v]) => s + v, 0);
  const weekSessions = sessions.filter((s) => weekKey(dayKey(s.start, timeZone)) === week);
  const kwh = weekSessions.reduce((s, x) => s + (x.kwh ?? 0), 0);
  return {
    week,
    km: Math.round(km),
    days: days.filter(([, v]) => v >= STREAK_MIN_KM).length,
    sessions: weekSessions.length,
    kwh: Math.round(kwh * 10) / 10,
    consumption:
      km < CONSUMPTION_CHALLENGE_MIN_KM
        ? null
        : weekConsumption
          ? weekConsumption(week)
          : kwh > 0
            ? Math.round((kwh / km) * 1000) / 10
            : null,
  };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Target derived from the average of the last 4 complete weeks; `history` is
 * empty when there is not enough history (then the fixed start value is used).
 */
export function challengeTarget(type: ChallengeType, history: WeekStats[]): number {
  if (history.length < HISTORY_WEEKS) return START_TARGETS[type];
  switch (type) {
    case 'km':
      return Math.max(50, Math.round((avg(history.map((w) => w.km)) * 1.1) / 10) * 10);
    case 'days':
      return Math.min(7, Math.max(2, Math.round(avg(history.map((w) => w.days))) + 1));
    case 'max_charges':
      return Math.max(1, Math.floor(avg(history.map((w) => w.sessions)) * 0.9));
    case 'consumption': {
      const values = history.map((w) => w.consumption).filter((v): v is number => v !== null);
      return values.length ? Math.round(avg(values) * 0.95 * 10) / 10 : START_TARGETS.consumption;
    }
  }
}

/** Small stable hash, so the choice for a week is deterministic. */
function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Pick the type for a week, never the same type as the previous week. */
export function chooseChallengeType(week: string, available: ChallengeType[], previous: ChallengeType | null): ChallengeType {
  const candidates = available.filter((t) => t !== previous);
  const pool = candidates.length ? candidates : available;
  return pool[hash(week) % pool.length];
}

/** The 4 complete weeks before `week`, or [] when measurement started later. */
export function historyWeeks(
  week: string,
  firstDay: string | null,
  dailyTotals: Map<string, number>,
  sessions: ChargingSession[],
  timeZone: string,
  weekConsumption?: (week: string) => number | null,
): WeekStats[] {
  const earliest = shiftPeriod('week', week, -HISTORY_WEEKS);
  if (!firstDay || firstDay > isoWeekStart(earliest)) return [];
  return Array.from({ length: HISTORY_WEEKS }, (_, i) =>
    weekStats(shiftPeriod('week', week, -(i + 1)), dailyTotals, sessions, timeZone, weekConsumption),
  );
}

export interface ChallengeContext {
  progress: DayProgress[];
  dailyTotals: Map<string, number>;
  sessions: ChargingSession[];
  timeZone: string;
  now: number;
  weekConsumption?: (week: string) => number | null;
}

/** Start and end (exclusive) of an ISO week, in epoch ms in the given time zone. */
export function weekBounds(week: string, timeZone: string): { start: number; end: number } {
  const monday = isoWeekStart(week);
  return { start: zonedMidnight(monday, timeZone), end: zonedMidnight(addDays(monday, 7), timeZone) };
}

/**
 * Progress and outcome of a challenge. Distance and driving-day challenges are
 * completed the moment the target is reached; the charging and consumption
 * challenges are only decided when the week is over.
 */
export function evaluateChallenge(ch: Challenge, ctx: ChallengeContext): ChallengeResult {
  const { end } = weekBounds(ch.week, ctx.timeZone);
  const ended = ctx.now >= end;
  const stats = weekStats(ch.week, ctx.dailyTotals, ctx.sessions.filter((s) => !s.ongoing || ended), ctx.timeZone, ctx.weekConsumption);
  let current: number | null;
  let completedTs: number | null = null;
  switch (ch.type) {
    case 'km':
      current = stats.km;
      completedTs = firstGroupCrossing(ctx.progress, (d) => (weekKey(d) === ch.week ? ch.week : null), ch.target);
      break;
    case 'days': {
      current = stats.days;
      const reached = [...dayReachTimes(ctx.progress, STREAK_MIN_KM)].filter(([d]) => weekKey(d) === ch.week).sort(([a], [b]) => (a < b ? -1 : 1));
      completedTs = reached[ch.target - 1]?.[1] ?? null;
      break;
    }
    case 'max_charges':
      current = stats.sessions;
      if (ended && stats.sessions <= ch.target) completedTs = end;
      break;
    case 'consumption':
      current = stats.consumption;
      if (ended && stats.consumption !== null && stats.consumption <= ch.target) completedTs = end;
      break;
  }
  if (completedTs !== null && completedTs > ctx.now) completedTs = null;
  const status: ChallengeStatus = completedTs !== null ? 'done' : ended ? 'missed' : 'active';
  return { ...ch, status, current, completedTs };
}

/** Days left in the challenge week, including today. */
export function daysLeft(week: string, now: number, timeZone: string): number {
  const today = dayKey(now, timeZone);
  const sunday = addDays(isoWeekStart(week), 6);
  if (today > sunday) return 0;
  let n = 0;
  for (let d = today; d <= sunday; d = addDays(d, 1)) n++;
  return n;
}

/** Dutch description of a challenge. */
export function describeChallenge(type: ChallengeType, target: number): { title: string; goal: string; unit: string } {
  const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  switch (type) {
    case 'km':
      return { title: 'Kilometerjager', goal: `Rij deze week ${nf.format(target)} km`, unit: 'km' };
    case 'days':
      return { title: 'Elke dag op pad', goal: `Rij deze week op ${target} dagen`, unit: 'dagen' };
    case 'max_charges':
      return { title: 'Zuinig met de stekker', goal: `Laad deze week hooguit ${target} keer`, unit: 'sessies' };
    case 'consumption':
      return {
        title: 'Zuinige rijder',
        goal: `Rij deze week zuiniger dan ${nf.format(target)} kWh/100 km (minstens ${CONSUMPTION_CHALLENGE_MIN_KM} km)`,
        unit: 'kWh/100 km',
      };
  }
}
