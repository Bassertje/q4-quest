import { describe, expect, it } from 'vitest';
import { historyPeriodView, periodRangeLabel } from '../src/history-period.ts';
import type { Series } from '../src/aggregate.ts';
import type { TripBlock } from '../src/trips.ts';
import { addDays } from '../src/time.ts';

// Fictional data from Mon 12 Oct 2026 to Wed 11 Nov 2026: 30 km on weekdays, nothing at weekends,
// and an extra 50 km every Monday.
function daily(): Series {
  const out: Series = [];
  for (let i = 0, d = '2026-10-12'; d <= '2026-11-11'; i++, d = addDays(d, 1)) {
    const wd = i % 7; // 0 = Monday
    out.push([d, wd >= 5 ? 0 : wd === 0 ? 80 : 30]);
  }
  return out;
}
const trip = (day: string, km: number): TripBlock =>
  ({ start: Date.parse(`${day}T08:00:00Z`), end: Date.parse(`${day}T09:00:00Z`), km, readings: 3, confirmedTs: null }) as TripBlock;
const input = () => ({
  daily: daily(),
  trips: [trip('2026-10-20', 25), trip('2026-11-02', 40), trip('2026-11-10', 12)],
  tripDay: (t: TripBlock) => new Date(t.start).toISOString().slice(0, 10),
  today: '2026-11-11',
});

describe('historyPeriodView', () => {
  it('computes km, driving days, average and busiest weekday for a month up to today', () => {
    const v = historyPeriodView(input(), 'month', null);
    expect(v.label).toBe('november 2026');
    expect(v.buckets).toHaveLength(30);
    // 1–11 Nov: Mon 2 and 9 (80 km), Tue–Fri 3–6 and 10–11 (30 km), Sun 1 / Sat–Sun 7–8: 0.
    expect(v.stats).toEqual({ km: 340, drivingDays: 8, days: 11, avgPerDay: 30.9, maxDayKm: 80, busiestWeekday: { day: 'ma', km: 160 } });
    expect(v.trips.map((t) => t.km)).toEqual([12, 40]);
    expect(v.tripCount).toBe(2);
  });

  it('counts only measured days and dims the time before the first measurement', () => {
    const v = historyPeriodView(input(), 'month', '2026-10');
    expect(v.stats?.days).toBe(20); // 12–31 Oct
    expect(v.buckets.filter((b) => b.beforeStart)).toHaveLength(11);
    expect(v.prev).toBeNull();
    expect(v.next).toBe('2026-11');
    expect(periodRangeLabel(v.dataFrom, v.dataTo)).toBe('12 okt – 31 okt');
  });

  it('groups per month for "all" and shows a dash without driving', () => {
    const all = historyPeriodView(input(), 'all', null);
    expect(all.buckets.map((b) => b.key)).toEqual(['2026-10', '2026-11']);
    expect(all.stats?.days).toBe(31);
    expect(periodRangeLabel(all.dataFrom, all.dataTo)).toBe('12 okt – 11 nov');
    const weekend = historyPeriodView({ ...input(), daily: input().daily.map(([d]) => [d, 0]) }, 'week', '2026-W45');
    expect(weekend.stats).toMatchObject({ km: 0, drivingDays: 0, avgPerDay: 0, maxDayKm: 0, busiestWeekday: null });
  });

  it('shows the real total with "all": an "earlier" bar with the first odometer value and the current odometer', () => {
    const odo = { odometerFirst: 12_000, odometerLatest: 13_550 };
    const all = historyPeriodView({ ...input(), ...odo }, 'all', null);
    expect(all.buckets[0]).toEqual({ key: 'earlier', km: 12_000, beforeStart: false, earlier: true });
    expect(all.odometerKm).toBe(13_550);
    // The measured statistics stay based on the measured days.
    expect(all.stats?.days).toBe(31);
    // No "earlier" bar without km before the start, and nothing extra for other periods.
    expect(historyPeriodView({ ...input(), odometerFirst: 0, odometerLatest: 1550 }, 'all', null).buckets[0].key).toBe('2026-10');
    const month = historyPeriodView({ ...input(), ...odo }, 'month', null);
    expect(month.buckets.some((b) => b.earlier)).toBe(false);
    expect(month.odometerKm).toBeNull();
  });

  it('adds years to the range only across a year boundary', () => {
    expect(periodRangeLabel('2025-12-29', '2026-01-04')).toBe('29 dec 2025 – 4 jan 2026');
    expect(periodRangeLabel('2026-11-11', '2026-11-11')).toBe('11 nov');
  });
});
