const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

export const km = (v: number) => nf0.format(Math.round(v));
export const num1 = (v: number) => nf1.format(v);
export const kw = (v: number) => nf1.format(v);
export const pct = (fraction: number) => `${nf1.format(fraction * 100)}%`;

export function date(ts: number, timeZone?: string): string {
  return new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone });
}

/** "zojuist", "12 min geleden", "3 uur geleden", or a date. */
export function ago(ts: number, now = Date.now()): string {
  const min = Math.round((now - ts) / 60_000);
  if (min < 2) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'gisteren' : `${days} dagen geleden`;
}

function utcDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
}

const fmt = (date: Date, opts: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('nl-NL', { ...opts, timeZone: 'UTC' });

/** Labels for 'YYYY-MM-DD', 'YYYY-Www' and 'YYYY-MM' keys. */
export function periodLabel(key: string, long = false): string {
  if (key.includes('-W')) {
    const [year, week] = key.split('-W');
    return long ? `week ${Number(week)}, ${year}` : `w${Number(week)}`;
  }
  if (key.length === 7) {
    return fmt(utcDate(key), long ? { month: 'long', year: 'numeric' } : { month: 'short' }).replace('.', '');
  }
  return fmt(utcDate(key), long ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' }).replace('.', '');
}

/** Short date for a calendar day key, e.g. "20 jul 2026". */
export function dayShort(day: string): string {
  return fmt(utcDate(day), { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
}
