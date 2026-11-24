import type { ChargingSession } from './charging.ts';
import { STREAK_MIN_KM } from './distance.ts';
import { isoWeekStart, shiftPeriod } from './periods.ts';
import { dayReachTimes, firstGroupCrossing, type DayProgress } from './progress.ts';
import { addDays, dayKey, weekKey, zonedMidnight } from './time.ts';
import {
  EVENT_CHALLENGE_XP,
  eventChallengeForWeek,
  isEventChallengeType,
  LIGHTS_FROM_MINUTES,
  type EventChallengeDef,
  type EventChallengeType,
} from './events.ts';
import type { TripBlock } from './trips.ts';
import { atOrBefore } from './consumption.ts';
import { kmReachedAt, type DriveCycle } from './cycles.ts';
import type { TimedValue } from './milestones.ts';

/** Normal types, plus the themed types of events (e.g. Winterrit). */
export type ChallengeType = 'km' | 'days' | 'max_charges' | 'consumption' | 'cycle_km' | 'cycle_range' | EventChallengeType;
export type NormalChallengeType = Exclude<ChallengeType, EventChallengeType>;

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
/** Bonus XP of a challenge: themed event challenges are worth more. */
export const challengeXp = (type: ChallengeType) => (isEventChallengeType(type) ? EVENT_CHALLENGE_XP : CHALLENGE_XP);
/** Fixed starting targets when there is not enough history. */
export const START_TARGETS: Record<NormalChallengeType, number> = { km: 200, days: 4, max_charges: 3, consumption: 18, cycle_km: 150, cycle_range: 350 };
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
  /** Most km driven on one charge within the week (0 without cycles). */
  cycleKm: number;
  /** Average estimated range of the usable cycles that ended in the week (null without). */
  cycleRange: number | null;
}

/** Cycles (between charging sessions) and odometer readings, for the "on one charge" challenges. */
export interface CycleData {
  cycles: DriveCycle[];
  odometer: TimedValue[];
}

/** Km driven on one charge within [from, to): per cycle, from the later of its start and `from`. */
export function cycleKmWithin(data: CycleData, from: number, to: number): number {
  let best = 0;
  for (const c of data.cycles) {
    const a = Math.max(c.start, from);
    const b = Math.min(c.end, to);
    if (b <= a) continue;
    const start = atOrBefore(data.odometer, a)?.value;
    const end = atOrBefore(data.odometer, b)?.value;
    if (start !== undefined && end !== undefined) best = Math.max(best, end - start);
  }
  return Math.round(best);
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
  cycleData?: CycleData,
): WeekStats {
  const days = [...dailyTotals].filter(([d]) => inWeek(week)(d));
  const bounds = weekBounds(week, timeZone);
  const ranges = (cycleData?.cycles ?? []).filter((c) => !c.ongoing && c.rangeKm !== null && c.end >= bounds.start && c.end < bounds.end).map((c) => c.rangeKm!);
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
    cycleKm: cycleData ? cycleKmWithin(cycleData, bounds.start, bounds.end) : 0,
    cycleRange: ranges.length ? Math.round(ranges.reduce((a, b) => a + b, 0) / ranges.length) : null,
  };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Target derived from the average of the last 4 complete weeks; `history` is
 * empty when there is not enough history (then the fixed start value is used).
 */
export function challengeTarget(type: NormalChallengeType, history: WeekStats[]): number {
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
    case 'cycle_km':
      return Math.max(50, Math.round((avg(history.map((w) => w.cycleKm)) * 1.1) / 10) * 10);
    case 'cycle_range': {
      // The last weeks reflect the season, so the target follows the temperature.
      const values = history.map((w) => w.cycleRange).filter((v): v is number => v !== null);
      return values.length ? Math.round((avg(values) * 1.05) / 10) * 10 : START_TARGETS.cycle_range;
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
export function chooseChallengeType(week: string, available: NormalChallengeType[], previous: ChallengeType | null): NormalChallengeType {
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
  cycleData?: CycleData,
): WeekStats[] {
  const earliest = shiftPeriod('week', week, -HISTORY_WEEKS);
  if (!firstDay || firstDay > isoWeekStart(earliest)) return [];
  return Array.from({ length: HISTORY_WEEKS }, (_, i) =>
    weekStats(shiftPeriod('week', week, -(i + 1)), dailyTotals, sessions, timeZone, weekConsumption, cycleData),
  );
}

export interface ChallengeContext {
  progress: DayProgress[];
  dailyTotals: Map<string, number>;
  sessions: ChargingSession[];
  timeZone: string;
  now: number;
  weekConsumption?: (week: string) => number | null;
  /** Trip blocks (needed for themed challenges such as Lichtjesroute). */
  trips?: TripBlock[];
  /** Cycles between charging sessions and odometer readings ("on one charge" challenges). */
  cycleData?: CycleData;
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
  const themed = eventChallengeForWeek(ch.week);
  if (themed && themed.type === ch.type) return evaluateEventChallenge(ch, themed, ctx);
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
    case 'cycle_km': {
      const data = ctx.cycleData;
      current = data ? cycleKmWithin(data, weekBounds(ch.week, ctx.timeZone).start, end) : null;
      if (data) {
        const { start } = weekBounds(ch.week, ctx.timeZone);
        const times = data.cycles
          .map((c) => (Math.min(c.end, end) > Math.max(c.start, start) ? kmReachedAt(data.odometer, Math.max(c.start, start), Math.min(c.end, end), ch.target) : null))
          .filter((t): t is number => t !== null);
        completedTs = times.length ? Math.min(...times) : null;
      }
      break;
    }
    case 'cycle_range': {
      // A finished cycle that ended this week with an estimated range of at least the target.
      const { start } = weekBounds(ch.week, ctx.timeZone);
      const done = (ctx.cycleData?.cycles ?? []).filter((c) => !c.ongoing && c.rangeKm !== null && c.end >= start && c.end < end);
      current = done.length ? Math.max(...done.map((c) => c.rangeKm!)) : null;
      completedTs = done.find((c) => c.rangeKm! >= ch.target)?.end ?? null;
      break;
    }
    default:
      current = null; // an event type outside its scheduled week: never completes
  }
  if (completedTs !== null && completedTs > ctx.now) completedTs = null;
  const status: ChallengeStatus = completedTs !== null ? 'done' : ended ? 'missed' : 'active';
  return { ...ch, status, current, completedTs };
}

/** Start and end (exclusive) of the days that count for a themed challenge. */
export function eventChallengeWindow(def: EventChallengeDef, timeZone: string): { start: number; end: number } {
  return { start: zonedMidnight(def.fromDay, timeZone), end: zonedMidnight(addDays(def.toDay, 1), timeZone) };
}

/**
 * Themed challenges (Winterrit):
 * - lights_km: km in trip blocks that start between 16:30 and 23:59, done when the target is reached;
 * - event_days: days with ≥ 1 km, done on the n-th day;
 * - full_charge: a session that ends at 100% within the window (21–23 Dec);
 * - max_km: fewer km than the target in the window, decided when it ends (1 Jan 23:59).
 */
function evaluateEventChallenge(ch: Challenge, def: EventChallengeDef, ctx: ChallengeContext): ChallengeResult {
  const { start, end } = eventChallengeWindow(def, ctx.timeZone);
  const ended = ctx.now >= end;
  const inWindow = (day: string) => day >= def.fromDay && day <= def.toDay;
  let current: number | null = null;
  let completedTs: number | null = null;
  switch (def.type) {
    case 'lights_km': {
      let km = 0;
      for (const t of ctx.trips ?? []) {
        if (t.start < start || t.start >= end) continue;
        const local = new Date(t.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ctx.timeZone });
        const [h, m] = local.split(':').map(Number);
        if (h * 60 + m < LIGHTS_FROM_MINUTES) continue;
        km += t.km;
        if (completedTs === null && km >= ch.target) completedTs = t.end;
      }
      current = Math.round(km);
      break;
    }
    case 'event_days': {
      const reached = [...dayReachTimes(ctx.progress, STREAK_MIN_KM)].filter(([d]) => inWindow(d)).sort(([a], [b]) => (a < b ? -1 : 1));
      current = reached.length;
      completedTs = reached[ch.target - 1]?.[1] ?? null;
      break;
    }
    case 'full_charge': {
      const inRange = ctx.sessions.filter((s) => !s.ongoing && s.end >= start && s.end < end && s.socEnd !== null);
      current = inRange.length ? Math.round(Math.max(...inRange.map((s) => s.socEnd!))) : null;
      completedTs = inRange.find((s) => Math.round(s.socEnd!) >= ch.target)?.end ?? null;
      break;
    }
    case 'max_km': {
      const km = [...ctx.dailyTotals].filter(([d]) => inWindow(d)).reduce((s, [, v]) => s + v, 0);
      current = Math.round(km);
      // Judged at the end of the window: 1 January 23:59.
      if (ended && km < ch.target) completedTs = end - 60_000;
      break;
    }
  }
  if (completedTs !== null && completedTs > ctx.now) completedTs = null;
  const status: ChallengeStatus = completedTs !== null ? 'done' : ended ? 'missed' : 'active';
  return { ...ch, status, current, completedTs };
}

/** Days left in the challenge week, including today (themed weeks end with their window). */
export function daysLeft(week: string, now: number, timeZone: string): number {
  const today = dayKey(now, timeZone);
  const themed = eventChallengeForWeek(week);
  const sunday = themed ? themed.toDay : addDays(isoWeekStart(week), 6);
  if (today > sunday) return 0;
  let n = 0;
  for (let d = today; d <= sunday; d = addDays(d, 1)) n++;
  return n;
}

/** Dutch description of a challenge. */
export function describeChallenge(type: ChallengeType, target: number, week?: string): { title: string; goal: string; unit: string } {
  const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
  if (isEventChallengeType(type)) {
    const def = week ? eventChallengeForWeek(week) : null;
    if (def && def.type === type) return { title: def.title, goal: def.goal, unit: def.unit };
    return { title: 'Winterrit', goal: 'Thema-uitdaging', unit: '' };
  }
  switch (type) {
    case 'km':
      return { title: 'Kilometerjager', goal: `Rij deze week ${nf.format(target)} km`, unit: 'km' };
    case 'days':
      return { title: 'Elke dag op pad', goal: `Rij deze week op ${target} dagen`, unit: 'dagen' };
    case 'max_charges':
      return { title: 'Zuinig met de stekker', goal: `Laad deze week hooguit ${target} keer`, unit: 'sessies' };
    case 'cycle_km':
      return { title: 'Op één lading', goal: `Rij deze week ${nf.format(target)} km op één lading`, unit: 'km' };
    case 'cycle_range':
      return { title: 'Bereikjager', goal: `Haal deze week op een lading een geschat bereik van ${nf.format(target)} km`, unit: 'km' };
    case 'consumption':
      return {
        title: 'Zuinige rijder',
        goal: `Rij deze week zuiniger dan ${nf.format(target)} kWh/100 km (minstens ${CONSUMPTION_CHALLENGE_MIN_KM} km)`,
        unit: 'kWh/100 km',
      };
  }
}
