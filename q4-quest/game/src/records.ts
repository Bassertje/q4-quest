import type { Series } from './aggregate.ts';
import { longestStreak, type StreakRun } from './distance.ts';
import type { TripBlock } from './trips.ts';

export interface PeriodRecord {
  key: string;
  km: number;
}

export interface DrivingRecords {
  bestDay: PeriodRecord | null;
  bestWeek: PeriodRecord | null;
  bestMonth: PeriodRecord | null;
  longestStreak: StreakRun | null;
  longestTrip: TripBlock | null;
}

function best(series: Series): PeriodRecord | null {
  let top: PeriodRecord | null = null;
  // The first period to reach the maximum keeps the record.
  for (const [key, km] of series) if (km > 0 && (!top || km > top.km)) top = { key, km };
  return top;
}

export function drivingRecords(input: {
  daily: Series;
  weekly: Series;
  monthly: Series;
  totals: Map<string, number>;
  trips: TripBlock[];
}): DrivingRecords {
  let longestTrip: TripBlock | null = null;
  for (const t of input.trips) if (!longestTrip || t.km > longestTrip.km) longestTrip = t;
  return {
    bestDay: best(input.daily),
    bestWeek: best(input.weekly),
    bestMonth: best(input.monthly),
    longestStreak: longestStreak(input.totals),
    longestTrip,
  };
}
