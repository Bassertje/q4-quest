import { dayKey } from './time.ts';
import type { TimedValue } from './milestones.ts';

export interface DayProgress {
  ts: number;
  day: string;
  /** Kilometres driven on this day up to and including this reading. */
  dayKm: number;
}

/**
 * Running distance per calendar day at every odometer reading, consistent with
 * dailyTotals(): measured from the last value of the previous day with data
 * (or from the first reading on the very first day).
 */
export function dayProgress(series: TimedValue[], timeZone: string): DayProgress[] {
  const out: DayProgress[] = [];
  let currentDay: string | null = null;
  let baseline = series[0]?.value ?? 0;
  let dayMax = baseline;
  for (const r of series) {
    const day = dayKey(r.ts, timeZone);
    if (day !== currentDay) {
      if (currentDay !== null) baseline = dayMax;
      currentDay = day;
    }
    dayMax = Math.max(dayMax, r.value);
    out.push({ ts: r.ts, day, dayKm: Math.max(0, dayMax - baseline) });
  }
  return out;
}

/**
 * First moment the running distance within a group of days (e.g. a week, a
 * month or a weekend) reaches `km`. `groupOf` returns null for days that do
 * not count.
 */
export function firstGroupCrossing(
  progress: DayProgress[],
  groupOf: (day: string) => string | null,
  km: number,
): number | null {
  const completed = new Map<string, number>();
  let lastDay: string | null = null;
  let lastDayKm = 0;
  for (const p of progress) {
    if (p.day !== lastDay) {
      if (lastDay !== null) {
        const g = groupOf(lastDay);
        if (g !== null) completed.set(g, (completed.get(g) ?? 0) + lastDayKm);
      }
      lastDay = p.day;
    }
    lastDayKm = p.dayKm;
    const group = groupOf(p.day);
    if (group !== null && (completed.get(group) ?? 0) + p.dayKm >= km) return p.ts;
  }
  return null;
}

/** For each day, the first moment the day's distance reached `km`. */
export function dayReachTimes(progress: DayProgress[], km: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of progress) if (p.dayKm >= km && !out.has(p.day)) out.set(p.day, p.ts);
  return out;
}
