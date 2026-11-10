import { addDays, dayKey, monthKey, weekKey } from './time.ts';
import type { TimedValue } from './milestones.ts';

/**
 * Kilometres per calendar day.
 * A day's total is its last odometer value minus the last value of the
 * previous day with data. For the very first day it is max − min of that day.
 * Input must be sorted by time; days without readings are absent.
 */
export function dailyTotals(series: TimedValue[], timeZone: string): Map<string, number> {
  const lastPerDay = new Map<string, number>();
  let firstDay: string | null = null;
  let firstValue = 0;
  for (const r of series) {
    const day = dayKey(r.ts, timeZone);
    if (firstDay === null) {
      firstDay = day;
      firstValue = r.value;
    }
    lastPerDay.set(day, Math.max(lastPerDay.get(day) ?? -Infinity, r.value));
  }

  const totals = new Map<string, number>();
  let previous: number | null = null;
  for (const [day, last] of lastPerDay) {
    const base = previous ?? firstValue;
    totals.set(day, Math.max(0, last - base));
    previous = last;
  }
  return totals;
}

/** Sum of daily totals for which `belongs(day)` is true. */
function sumWhere(totals: Map<string, number>, belongs: (day: string) => boolean): number {
  let sum = 0;
  for (const [day, km] of totals) if (belongs(day)) sum += km;
  return sum;
}

export function periodTotals(totals: Map<string, number>, today: string) {
  const week = weekKey(today);
  const month = monthKey(today);
  return {
    today: totals.get(today) ?? 0,
    week: sumWhere(totals, (d) => d <= today && weekKey(d) === week),
    month: sumWhere(totals, (d) => d <= today && monthKey(d) === month),
  };
}

/** Minimum distance for a day to count towards a streak. */
export const STREAK_MIN_KM = 1;

/**
 * Current streak: consecutive days with ≥ 1 km, ending today. If nothing has
 * been driven yet today, the streak up to yesterday still counts.
 */
export function currentStreak(totals: Map<string, number>, today: string): number {
  const drove = (d: string) => (totals.get(d) ?? 0) >= STREAK_MIN_KM;
  let day = drove(today) ? today : addDays(today, -1);
  let streak = 0;
  while (drove(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}
