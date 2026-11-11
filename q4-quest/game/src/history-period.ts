import type { Series } from './aggregate.ts';
import { periodWindow, type PeriodWindow, type ViewPeriodMode } from './period-view.ts';
import { addDays, monthKey } from './time.ts';
import type { TripBlock } from './trips.ts';

/** A driving day counts from this many km. */
export const DRIVING_DAY_MIN_KM = 1;
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

/** Weekday of a day key, Monday = 0. */
function weekdayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export interface HistoryPeriodStats {
  /** Km driven in the period. */
  km: number;
  /** Days with at least 1 km. */
  drivingDays: number;
  /** Days of the period with measurements (from the first measurement up to and including today). */
  days: number;
  /** Km ÷ driving days (null without driving days). */
  avgPerDrivingDay: number | null;
  /** Most km on a single day. */
  maxDayKm: number;
  /** Weekday with the most km in total (null without driving). */
  busiestWeekday: { day: string; km: number } | null;
}

export interface HistoryPeriodView extends Omit<PeriodWindow, 'buckets'> {
  buckets: { key: string; km: number; beforeStart: boolean }[];
  /** Null without any measured day in the period. */
  stats: HistoryPeriodStats | null;
  /** Trip blocks that started in the period, newest first (at most `maxTrips`). */
  trips: TripBlock[];
  tripCount: number;
}

export interface HistoryPeriodInput {
  /** Km per day, filled from the first measurement to today. */
  daily: Series;
  trips: TripBlock[];
  /** Start time of each trip as a day key. */
  tripDay: (t: TripBlock) => string;
  today: string;
}

const r1 = (v: number) => Math.round(v * 10 + 1e-9) / 10 || 0;

/** Statistics, chart and trip blocks of the history screen for one period. */
export function historyPeriodView(input: HistoryPeriodInput, mode: ViewPeriodMode, requested: string | null, maxTrips = 100): HistoryPeriodView {
  const firstDay = input.daily[0]?.[0] ?? input.today;
  const w = periodWindow(mode, requested, firstDay, input.today);
  const perDay = new Map(input.daily);

  const bucketKm = new Map<string, number>();
  for (const [day, km] of input.daily) {
    if (day < w.fromDay || day >= w.toDay) continue;
    const k = w.bucket === 'day' ? day : monthKey(day);
    bucketKm.set(k, (bucketKm.get(k) ?? 0) + km);
  }
  const buckets = w.buckets.map((b) => ({ ...b, km: r1(bucketKm.get(b.key) ?? 0) }));

  let stats: HistoryPeriodStats | null = null;
  if (w.dataFrom && w.dataTo) {
    let km = 0;
    let days = 0;
    let drivingDays = 0;
    let maxDay = 0;
    const perWeekday = new Array<number>(7).fill(0);
    for (let d = w.dataFrom; d <= w.dataTo; d = addDays(d, 1)) {
      const v = perDay.get(d) ?? 0;
      days++;
      km += v;
      if (v >= DRIVING_DAY_MIN_KM) drivingDays++;
      if (v > maxDay) maxDay = v;
      perWeekday[weekdayIndex(d)] += v;
    }
    const best = perWeekday.reduce((bi, v, i) => (v > perWeekday[bi] ? i : bi), 0);
    stats = {
      km: r1(km),
      drivingDays,
      days,
      avgPerDrivingDay: drivingDays ? r1(km / drivingDays) : null,
      maxDayKm: r1(maxDay),
      busiestWeekday: perWeekday[best] > 0 ? { day: WEEKDAYS[best], km: r1(perWeekday[best]) } : null,
    };
  }

  const inPeriod = input.trips.filter((t) => {
    const d = input.tripDay(t);
    return d >= w.fromDay && d < w.toDay;
  });
  const { buckets: _ignored, ...rest } = w;
  return { ...rest, buckets, stats, trips: inPeriod.slice(-maxTrips).reverse(), tripCount: inPeriod.length };
}

/** Short date range of the measured part of a period: "12 okt – 11 nov", with years only across a year boundary. */
export function periodRangeLabel(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const fmt = (day: string, year: boolean) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d))
      .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' })
      .replace('.', '');
  };
  const crossYear = from.slice(0, 4) !== to.slice(0, 4);
  if (from === to) return fmt(from, false);
  return `${fmt(from, crossYear)} – ${fmt(to, crossYear)}`;
}
