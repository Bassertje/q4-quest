import { describeChallenge, weekStats, type ChallengeResult } from './challenges.ts';
import type { ChargingRecords, ChargingSession } from './charging.ts';
import type { DrivingRecords } from './records.ts';
import { dayKey, weekKey } from './time.ts';

export interface WeekReview {
  week: string;
  km: number;
  /** Null when charging sensors are not configured. */
  sessions: number | null;
  factKind: 'record' | 'challenge' | 'bestDay' | 'quiet';
  fact: string;
}

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

function weekday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'UTC' });
}

/**
 * "Last week" card: km, charging sessions, and the most striking fact.
 * Priority: a new record set that week > the weekly challenge (done or
 * missed) > the best day of the week.
 */
export function buildWeekReview(input: {
  week: string;
  dailyTotals: Map<string, number>;
  sessions: ChargingSession[] | null;
  records: DrivingRecords | null;
  chargingRecords: ChargingRecords | null;
  challenge: ChallengeResult | null;
  timeZone: string;
}): WeekReview {
  const { week, timeZone } = input;
  const stats = weekStats(week, input.dailyTotals, input.sessions ?? [], timeZone);
  const base = { week, km: stats.km, sessions: input.sessions ? stats.sessions : null };
  const inWeek = (day: string) => weekKey(day) === week;
  const r = input.records;
  const c = input.chargingRecords;

  const records: string[] = [];
  if (r?.bestWeek && r.bestWeek.key === week) records.push(`Beste week ooit (${nf.format(r.bestWeek.km)} km)`);
  if (r?.bestDay && inWeek(r.bestDay.key)) records.push(`Beste dag ooit (${nf.format(r.bestDay.km)} km)`);
  if (r?.longestTrip && inWeek(dayKey(r.longestTrip.start, timeZone))) records.push(`Grootste ritblok ooit (${nf.format(r.longestTrip.km)} km)`);
  if (r?.longestStreak && inWeek(r.longestStreak.end)) records.push(`Langste streak ooit (${r.longestStreak.days} dagen)`);
  if (c?.fastest?.avgKw != null && inWeek(dayKey(c.fastest.start, timeZone))) records.push(`Snelste laadsessie ooit (gem. ${nf.format(c.fastest.avgKw)} kW)`);
  if (records.length) return { ...base, factKind: 'record', fact: `Nieuw record: ${records[0]}` };

  const ch = input.challenge;
  if (ch && ch.week === week && ch.status !== 'active') {
    const d = describeChallenge(ch.type, ch.target);
    const fact =
      ch.status === 'done'
        ? `Weekuitdaging gehaald: ${d.goal.charAt(0).toLowerCase()}${d.goal.slice(1)}`
        : ch.type === 'max_charges' || ch.type === 'consumption'
          ? `Weekuitdaging gemist: ${ch.current === null ? '–' : nf.format(ch.current)} ${d.unit} (doel ≤ ${nf.format(ch.target)})`
          : `Weekuitdaging gemist: ${ch.current === null ? '–' : nf.format(ch.current)} van ${nf.format(ch.target)} ${d.unit}`;
    return { ...base, factKind: 'challenge', fact };
  }

  const days = [...input.dailyTotals].filter(([d, km]) => inWeek(d) && km > 0);
  if (days.length) {
    const [day, km] = days.reduce((a, b) => (b[1] > a[1] ? b : a));
    return { ...base, factKind: 'bestDay', fact: `Beste dag: ${weekday(day)} met ${nf.format(km)} km` };
  }
  return { ...base, factKind: 'quiet', fact: 'Een rustige week zonder ritten.' };
}
