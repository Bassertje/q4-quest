// Dutch labels for calendar keys, shared by the server and the web frontend.

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
