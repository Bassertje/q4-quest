import { periodLabel } from './labels.ts';
import { isoWeekStart, shiftPeriod } from './periods.ts';
import { addDays, monthKey, weekKey } from './time.ts';

/** Period choice shared by the charging and history screens. */
export type ViewPeriodMode = 'week' | 'month' | 'year' | 'all';
export const VIEW_PERIOD_MODES: readonly ViewPeriodMode[] = ['week', 'month', 'year', 'all'];

export function isViewPeriodMode(v: unknown): v is ViewPeriodMode {
  return typeof v === 'string' && (VIEW_PERIOD_MODES as readonly string[]).includes(v);
}

/** Period key ('2026-W46', '2026-11', '2026' or 'all') containing a day. */
export function viewPeriodKey(mode: ViewPeriodMode, day: string): string {
  if (mode === 'week') return weekKey(day);
  if (mode === 'month') return monthKey(day);
  if (mode === 'year') return day.slice(0, 4);
  return 'all';
}

/** Whether a key is a well-formed key for the mode. */
export function isViewPeriodKey(mode: ViewPeriodMode, key: string): boolean {
  if (mode === 'all') return key === 'all';
  if (mode === 'week') return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key) && weekKey(isoWeekStart(key)) === key;
  if (mode === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  return /^\d{4}$/.test(key);
}

export function shiftViewPeriod(mode: ViewPeriodMode, key: string, n: number): string {
  if (mode === 'all') return key;
  if (mode === 'year') return String(Number(key) + n);
  return shiftPeriod(mode, key, n);
}

/** First day and the day after the last day of a period ("all": whole months from the first measurement to now). */
export function viewPeriodDays(mode: ViewPeriodMode, key: string, firstDay: string, today: string): { from: string; to: string } {
  if (mode === 'week') {
    const from = isoWeekStart(key);
    return { from, to: addDays(from, 7) };
  }
  if (mode === 'month') return { from: `${key}-01`, to: `${shiftPeriod('month', key, 1)}-01` };
  if (mode === 'year') return { from: `${key}-01-01`, to: `${Number(key) + 1}-01-01` };
  return { from: `${monthKey(firstDay)}-01`, to: `${shiftPeriod('month', monthKey(today), 1)}-01` };
}

/** Label: "week 46, 2026", "november 2026", "2026" or "All-time". */
export function viewPeriodLabel(mode: ViewPeriodMode, key: string): string {
  if (mode === 'all') return 'All-time';
  if (mode === 'year') return key;
  return periodLabel(key, true);
}

export interface PeriodBucketKey {
  /** Day key (week/month view) or month key (year/all view). */
  key: string;
  /** The bucket lies entirely before the first measurement. */
  beforeStart: boolean;
}

export interface PeriodWindow {
  mode: ViewPeriodMode;
  key: string;
  label: string;
  /** Neighbouring periods, null at the edges (before the data or after today). */
  prev: string | null;
  next: string | null;
  /** First day and the day after the last day of the period. */
  fromDay: string;
  toDay: string;
  /** Days of the period that have data: from the first measurement up to and including today (null: none). */
  dataFrom: string | null;
  dataTo: string | null;
  bucket: 'day' | 'month';
  buckets: PeriodBucketKey[];
}

/**
 * The period to show for a mode and an optional requested key. A key outside
 * the data range is clamped to the nearest period; an invalid key means "now".
 */
export function periodWindow(mode: ViewPeriodMode, requested: string | null, firstDay: string, today: string): PeriodWindow {
  const first = firstDay <= today ? firstDay : today;
  const firstKey = viewPeriodKey(mode, first);
  const lastKey = viewPeriodKey(mode, today);
  let key = requested && isViewPeriodKey(mode, requested) ? requested : lastKey;
  if (key > lastKey) key = lastKey;
  if (key < firstKey) key = firstKey;
  const { from, to } = viewPeriodDays(mode, key, first, today);
  const bucket = mode === 'week' || mode === 'month' ? 'day' : 'month';
  const firstBucket = bucket === 'day' ? first : monthKey(first);
  const buckets: PeriodBucketKey[] = [];
  for (let d = from; d < to; d = bucket === 'day' ? addDays(d, 1) : `${shiftPeriod('month', monthKey(d), 1)}-01`) {
    const k = bucket === 'day' ? d : monthKey(d);
    buckets.push({ key: k, beforeStart: k < firstBucket });
  }
  const dataFrom = from > first ? from : first;
  const last = addDays(to, -1);
  const dataTo = last < today ? last : today;
  return {
    mode,
    key,
    label: viewPeriodLabel(mode, key),
    prev: mode === 'all' || key <= firstKey ? null : shiftViewPeriod(mode, key, -1),
    next: mode === 'all' || key >= lastKey ? null : shiftViewPeriod(mode, key, 1),
    fromDay: from,
    toDay: to,
    dataFrom: dataFrom <= dataTo ? dataFrom : null,
    dataTo: dataFrom <= dataTo ? dataTo : null,
    bucket,
    buckets,
  };
}
