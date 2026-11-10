import { addDays, monthKey, weekKey } from './time.ts';
import type { Series } from './aggregate.ts';

export type PeriodMode = 'day' | 'week' | 'month';

/** Monday (as a day key) of an ISO week key such as '2026-W46'. */
export function isoWeekStart(week: string): string {
  const [year, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** The period key (day, ISO week or month) that contains a day key. */
export function periodOf(mode: PeriodMode, day: string): string {
  return mode === 'day' ? day : mode === 'week' ? weekKey(day) : monthKey(day);
}

/** Move a period key n periods forward (or back, for negative n). */
export function shiftPeriod(mode: PeriodMode, key: string, n: number): string {
  if (mode === 'day') return addDays(key, n);
  if (mode === 'week') return weekKey(addDays(isoWeekStart(key), 7 * n));
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export interface ChartBar {
  key: string;
  km: number;
  /** The period lies entirely before the first measurement. */
  beforeStart: boolean;
}

/**
 * A fixed window of `count` periods ending at `endKey`. Periods without data
 * get 0 km; periods before the first measurement are flagged.
 */
export function chartWindow(series: Series, mode: PeriodMode, endKey: string, count: number, firstKey: string): ChartBar[] {
  const values = new Map(series);
  const bars: ChartBar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = shiftPeriod(mode, endKey, -i);
    bars.push({ key, km: values.get(key) ?? 0, beforeStart: key < firstKey });
  }
  return bars;
}
