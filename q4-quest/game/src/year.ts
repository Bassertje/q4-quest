import type { BadgeResult } from './badges.ts';
import { chargingTotals, type ChargingSession, type ChargingTotals } from './charging.ts';
import { greenTotals, type GreenFactors, type GreenTotals } from './green.ts';
import { longestStreak, STREAK_MIN_KM, type StreakRun } from './distance.ts';
import { levelForXp, rankForLevel } from './levels.ts';
import { EARTH_KM, type TimedValue } from './milestones.ts';
import type { PeriodRecord } from './records.ts';
import { dayKey, weekKey, zonedMidnight } from './time.ts';

/** The overview of a year becomes available on this day (month-day) of that year. */
export const YEAR_REVIEW_FROM = '12-01';

export interface YearAvailability {
  year: number;
  available: boolean;
  /** The year is still running (data up to today). */
  running: boolean;
}

/**
 * Every year with data. Past years are always available; the current year
 * from 1 December onwards.
 */
export function yearsWithReview(firstDay: string | null, today: string): YearAvailability[] {
  if (!firstDay) return [];
  const first = Number(firstDay.slice(0, 4));
  const current = Number(today.slice(0, 4));
  const out: YearAvailability[] = [];
  for (let y = first; y <= current; y++) {
    const running = y === current;
    out.push({ year: y, available: !running || today >= `${y}-${YEAR_REVIEW_FROM}`, running });
  }
  return out;
}

export interface YearReview {
  year: number;
  /** First and last day with data that the review covers. */
  from: string;
  to: string;
  /** Measurement started during this year. */
  startedThisYear: boolean;
  /** The year is still running. */
  running: boolean;
  totalKm: number;
  daysDriven: number;
  bestDay: PeriodRecord | null;
  bestWeek: PeriodRecord | null;
  longestStreak: StreakRun | null;
  charging: ChargingTotals | null;
  newBadges: { id: string; name: string; icon: string; category: string; xp: number; ts: number }[];
  level: { start: number; end: number; startRank: string; endRank: string; xpGained: number };
  earth: { km: number; laps: number };
  /** CO₂ saved, litres not burned and trees, for this year (null without factors). */
  green: GreenTotals | null;
  /** Weekly challenges completed this year. */
  challengesDone: number;
}

export interface YearInput {
  year: number;
  odometer: TimedValue[];
  dailyTotals: Map<string, number>;
  /** Finished charging sessions, or null when charging sensors are not configured. */
  sessions: ChargingSession[] | null;
  badges: BadgeResult[];
  timeZone: string;
  now: number;
  green?: GreenFactors;
}

function best(entries: Iterable<[string, number]>): PeriodRecord | null {
  let top: PeriodRecord | null = null;
  for (const [key, km] of entries) if (km > 0 && (!top || km > top.km)) top = { key, km };
  return top;
}

/** XP at a moment: the odometer then, plus the bonus XP of badges unlocked by then. */
function xpAt(input: YearInput, ts: number): number {
  let odo = input.odometer[0]?.value ?? 0;
  for (const r of input.odometer) {
    if (r.ts > ts) break;
    odo = r.value;
  }
  const bonus = input.badges.reduce((sum, b) => sum + (b.unlockedTs !== null && b.unlockedTs <= ts ? b.xp : 0), 0);
  return odo + bonus;
}

/** Everything the year overview shows, for one calendar year in the HA time zone. */
export function buildYearReview(input: YearInput): YearReview | null {
  const { year, timeZone } = input;
  const prefix = `${year}-`;
  const days = [...input.dailyTotals].filter(([d]) => d.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1));
  const first = input.odometer[0];
  if (!first) return null;
  const firstDay = dayKey(first.ts, timeZone);
  const today = dayKey(input.now, timeZone);
  if (firstDay > `${year}-12-31` || today < `${year}-01-01`) return null;

  const yearStart = zonedMidnight(`${year}-01-01`, timeZone);
  const yearEnd = zonedMidnight(`${year + 1}-01-01`, timeZone);
  const startedThisYear = firstDay >= `${year}-01-01`;
  const running = today <= `${year}-12-31`;

  const totals = new Map(days);
  const weeks = new Map<string, number>();
  for (const [d, km] of days) weeks.set(weekKey(d), (weeks.get(weekKey(d)) ?? 0) + km);
  const totalKm = days.reduce((sum, [, km]) => sum + km, 0);

  const inYear = (ts: number) => ts >= yearStart && ts < yearEnd;
  const sessions = input.sessions?.filter((s) => inYear(s.start)) ?? null;
  // Badges dated at the very first reading were earned before the measurement started.
  const challengesDone = input.badges.filter(
    (b) => b.category === 'weekuitdaging' && b.unlockedTs !== null && inYear(b.unlockedTs),
  ).length;
  const newBadges = input.badges
    .filter((b) => b.category !== 'weekuitdaging' && b.unlockedTs !== null && inYear(b.unlockedTs) && b.unlockedTs !== first.ts)
    .sort((a, b) => a.unlockedTs! - b.unlockedTs!)
    .map((b) => ({ id: b.id, name: b.name, icon: b.icon, category: b.category, xp: b.xp, ts: b.unlockedTs! }));

  const startXp = xpAt(input, Math.max(yearStart, first.ts));
  const endXp = xpAt(input, Math.min(yearEnd - 1, input.now));
  const startLevel = levelForXp(startXp);
  const endLevel = levelForXp(endXp);

  return {
    year,
    from: startedThisYear ? firstDay : `${year}-01-01`,
    to: running ? today : `${year}-12-31`,
    startedThisYear,
    running,
    totalKm: Math.round(totalKm),
    daysDriven: days.filter(([, km]) => km >= STREAK_MIN_KM).length,
    bestDay: best(days),
    bestWeek: best(weeks),
    longestStreak: longestStreak(totals),
    charging: sessions ? chargingTotals(sessions) : null,
    newBadges,
    level: {
      start: startLevel,
      end: endLevel,
      startRank: rankForLevel(startLevel),
      endRank: rankForLevel(endLevel),
      xpGained: Math.max(0, Math.round(endXp - startXp)),
    },
    earth: { km: EARTH_KM, laps: totalKm / EARTH_KM },
    green: input.green
      ? greenTotals(totalKm, sessions ? sessions.reduce((s, x) => s + (x.kwh ?? 0), 0) : null, input.green)
      : null,
    challengesDone,
  };
}
