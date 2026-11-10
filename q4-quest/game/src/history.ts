import { filledDaily, monthlyTotals, weeklyTotals, type Series } from './aggregate.ts';
import { dailyTotals } from './distance.ts';
import type { TimedValue } from './milestones.ts';
import { drivingRecords, type DrivingRecords } from './records.ts';
import { dayKey } from './time.ts';
import { timeline, type TimelineEvent } from './timeline.ts';
import { tripBlocks, type TimedState, type TripBlock } from './trips.ts';

export interface HistoryInput {
  odometer: TimedValue[];
  parkingBrake?: TimedState[];
  now: number;
  timeZone: string;
}

export interface History {
  daily: Series;
  weekly: Series;
  monthly: Series;
  records: DrivingRecords;
  trips: TripBlock[];
  timeline: { initial: TimelineEvent[]; events: TimelineEvent[] };
}

/** Everything the History screen shows, computed from the readings. */
export function buildHistory(input: HistoryInput): History | null {
  if (input.odometer.length === 0) return null;
  const totals = dailyTotals(input.odometer, input.timeZone);
  const first = dayKey(input.odometer[0].ts, input.timeZone);
  const today = dayKey(input.now, input.timeZone);
  const daily = filledDaily(totals, first, today > first ? today : first);
  const weekly = weeklyTotals(daily);
  const monthly = monthlyTotals(daily);
  const trips = tripBlocks(input.odometer, input.parkingBrake);
  return {
    daily,
    weekly,
    monthly,
    records: drivingRecords({ daily, weekly, monthly, totals, trips }),
    trips,
    timeline: timeline(input.odometer),
  };
}
