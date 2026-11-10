/**
 * Calendar helpers. Day keys are 'YYYY-MM-DD' strings in a given IANA time
 * zone; arithmetic on day keys is pure calendar math (no time zone needed).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function parts(ts: number, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(ts)) out[p.type] = p.value;
  return out;
}

/** Calendar day of a timestamp in the given time zone. */
export function dayKey(ts: number, timeZone: string): string {
  const p = parts(ts, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Local hour (0-23) of a timestamp in the given time zone. */
export function localHour(ts: number, timeZone: string): number {
  return Number(parts(ts, timeZone).hour);
}

function toUtcDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = toUtcDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtcDate(d);
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** ISO 8601 week key, e.g. '2026-W05' (weeks start on Monday). */
export function weekKey(day: string): string {
  const d = toUtcDate(day);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - weekday + 3); // Thursday of this week
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Epoch milliseconds of local midnight at the start of a day key in a time zone. */
export function zonedMidnight(day: string, timeZone: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  let ts = target;
  // Two corrections are enough to settle on the right offset, also around DST changes.
  for (let i = 0; i < 2; i++) {
    const p = parts(ts, timeZone);
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    ts -= local - target;
  }
  return ts;
}

/** Whether a day key is a Saturday or Sunday. */
export function isWeekend(day: string): boolean {
  const weekday = toUtcDate(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}
