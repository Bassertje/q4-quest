import { addDays, monthKey, weekKey } from './time.ts';

export type Series = [key: string, km: number][];

/** Daily totals from `from` to `to` (inclusive), with 0 for days without data. */
export function filledDaily(totals: Map<string, number>, from: string, to: string): Series {
  const out: Series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push([d, totals.get(d) ?? 0]);
  return out;
}

function groupBy(daily: Series, keyOf: (day: string) => string): Series {
  const out: Series = [];
  for (const [day, km] of daily) {
    const key = keyOf(day);
    const last = out.at(-1);
    if (last && last[0] === key) last[1] += km;
    else out.push([key, km]);
  }
  return out;
}

/** Weekly totals (ISO weeks), from a zero-filled daily series. */
export function weeklyTotals(daily: Series): Series {
  return groupBy(daily, weekKey);
}

/** Monthly totals, from a zero-filled daily series. */
export function monthlyTotals(daily: Series): Series {
  return groupBy(daily, monthKey);
}
