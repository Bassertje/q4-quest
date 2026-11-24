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

// Period labels are shared with the server (reveal texts).
export { dayShort, periodLabel } from '../../../game/src/labels.ts';

/** Short date without year, e.g. "ma 9 nov". */
export function dayNoYear(ts: number, timeZone?: string): string {
  return new Date(ts)
    .toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
    .replace(/\./g, '');
}

/** Month heading, e.g. "November 2026". */
export function monthTitle(ts: number, timeZone?: string): string {
  const s = new Date(ts).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compact age for the LCD: "NU" (< 2 min), "12M", "3U", "2D". */
export function agoShort(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60_000);
  if (min < 2) return 'NU';
  if (min < 60) return `${min}M`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}U`;
  return `${Math.floor(hours / 24)}D`;
}

/** SoC range with both percent signs, e.g. "71% → 100%" (unknown values as "?"). */
export function socRange(from: number | null, to: number | null): string {
  const pct = (v: number | null) => (v === null ? '?' : `${Math.round(v)}%`);
  return `${pct(from)} → ${pct(to)}`;
}

/** First letter in upper case ("rij 61–70" → "Rij 61–70"). */
export const capitaliseFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Short day range: "ma 9 – do 12 nov", "ma 30 nov – wo 2 dec" or, within one day, "ma 9 nov". */
export function dayRange(from: number, to: number, timeZone?: string): string {
  const parts = (ts: number) => {
    const d = new Date(ts);
    const wd = d.toLocaleDateString('nl-NL', { weekday: 'short', timeZone }).replace('.', '');
    const day = d.toLocaleDateString('nl-NL', { day: 'numeric', timeZone });
    const month = d.toLocaleDateString('nl-NL', { month: 'short', timeZone }).replace('.', '');
    return { wd, day, month, key: d.toLocaleDateString('en-CA', { timeZone }) };
  };
  const a = parts(from);
  const b = parts(to);
  if (a.key === b.key) return `${a.wd} ${a.day} ${a.month}`;
  if (a.month === b.month && a.key.slice(0, 4) === b.key.slice(0, 4)) return `${a.wd} ${a.day} – ${b.wd} ${b.day} ${b.month}`;
  return `${a.wd} ${a.day} ${a.month} – ${b.wd} ${b.day} ${b.month}`;
}

/** Duration in days, or hours below a day: "3 dagen", "1 dag", "14 uur". */
export function durationLabel(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)} uur`;
  const days = Math.round(ms / 86_400_000);
  return `${days} ${days === 1 ? 'dag' : 'dagen'}`;
}

/** Temperature like "−2°" (with a real minus sign) or "–" when unknown. */
export function tempShort(t: number | null): string {
  if (t === null) return '–';
  const r = Math.round(t);
  return `${r < 0 ? '−' : ''}${Math.abs(r)}°`;
}

/** Temperature with one decimal and a real minus sign: "−5,6 °C". */
export function tempC(t: number): string {
  return `${num1(t).replace('-', '−')} °C`;
}
