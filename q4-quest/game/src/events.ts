import type { BadgeContext, BadgeDef } from './badges.ts';
import { STREAK_MIN_KM } from './distance.ts';
import { WORLD_TRIP } from './milestones.ts';
import { dayReachTimes, firstGroupCrossing } from './progress.ts';
import { temperatureAt } from './temperature.ts';
import { addDays, dayKey, localHour, zonedMidnight } from './time.ts';
import { MIN_READINGS_FOR_TIME_BADGES } from './trips.ts';

// ---------- events as data ----------

/** Visual theme of an event (decoration in the web frontend). */
export type EventTheme = 'winter';

export interface EventDef {
  id: string;
  name: string;
  /** First day as "MM-DD" in the year of the event. */
  startMonthDay: string;
  /** Last day (inclusive) as "MM-DD"; when it sorts before the start it lies in the next year. */
  endMonthDay: string;
  theme: EventTheme;
}

/** Winterrit: 6 December 00:00 up to and including 1 January 23:59, every year. */
export const WINTERRIT: EventDef = { id: 'winterrit', name: 'Winterrit', startMonthDay: '12-06', endMonthDay: '01-01', theme: 'winter' };
export const EVENTS: EventDef[] = [WINTERRIT];

/** One occurrence of an event, e.g. Winterrit 2026 (6 Dec 2026 – 1 Jan 2027). */
export interface EventInstance {
  /** E.g. "winterrit_2026". */
  id: string;
  eventId: string;
  /** E.g. "Winterrit 2026". */
  name: string;
  year: number;
  /** First and last day (inclusive), as day keys in the HA time zone. */
  startDay: string;
  endDay: string;
  /** Epoch ms of local midnight at the start, and of local midnight after the last day (exclusive). */
  start: number;
  end: number;
  theme: EventTheme;
}

export function eventInstance(def: EventDef, year: number, timeZone: string): EventInstance {
  const startDay = `${year}-${def.startMonthDay}`;
  const endYear = def.endMonthDay < def.startMonthDay ? year + 1 : year;
  const endDay = `${endYear}-${def.endMonthDay}`;
  return {
    id: `${def.id}_${year}`,
    eventId: def.id,
    name: `${def.name} ${year}`,
    year,
    startDay,
    endDay,
    start: zonedMidnight(startDay, timeZone),
    end: zonedMidnight(addDays(endDay, 1), timeZone),
    theme: def.theme,
  };
}

/** The occurrence of an event that contains a day, if any. */
export function eventOnDay(def: EventDef, day: string, timeZone: string): EventInstance | null {
  const year = Number(day.slice(0, 4));
  for (const y of [year, year - 1]) {
    const inst = eventInstance(def, y, timeZone);
    if (day >= inst.startDay && day <= inst.endDay) return inst;
  }
  return null;
}

/** The event that is running at `now` (local time in the HA time zone), if any. */
export function activeEvent(now: number, timeZone: string, defs: EventDef[] = EVENTS): EventInstance | null {
  const day = dayKey(now, timeZone);
  for (const def of defs) {
    const inst = eventOnDay(def, day, timeZone);
    if (inst) return inst;
  }
  return null;
}

/**
 * Occurrences that have started by `now` and did not end before measurement
 * began (`since`); their badges are shown, the past ones as "not achieved".
 */
export function startedEvents(now: number, since: number | null, timeZone: string, defs: EventDef[] = EVENTS): EventInstance[] {
  if (since === null) return [];
  const out: EventInstance[] = [];
  const firstYear = Number(dayKey(since, timeZone).slice(0, 4)) - 1;
  const lastYear = Number(dayKey(now, timeZone).slice(0, 4));
  for (const def of defs) {
    for (let y = firstYear; y <= lastYear; y++) {
      const inst = eventInstance(def, y, timeZone);
      if (inst.start <= now && inst.end > since) out.push(inst);
    }
  }
  return out;
}

// ---------- themed weekly challenges ----------

export type EventChallengeType = 'lights_km' | 'event_days' | 'full_charge' | 'max_km';
/** Bonus XP of a themed challenge. */
export const EVENT_CHALLENGE_XP = 150;

export interface EventChallengeDef {
  /** ISO week the challenge belongs to. */
  week: string;
  type: EventChallengeType;
  target: number;
  title: string;
  goal: string;
  unit: string;
  /** First and last day (inclusive) that count; the last week is cut off at the end of the event. */
  fromDay: string;
  toDay: string;
}

/** Trips for "Lichtjesroute" count when they start between 16:30 and 23:59. */
export const LIGHTS_FROM_MINUTES = 16 * 60 + 30;

/**
 * Themed challenges per Winterrit year. Only 2026 is defined; for other years
 * the normal weekly challenges simply continue (the rule for later years is
 * still to be decided).
 */
export const WINTERRIT_SCHEDULE: Record<number, EventChallengeDef[]> = {
  2026: [
    { week: '2026-W50', type: 'lights_km', target: 150, title: 'Lichtjesroute', goal: 'Rij 150 km na zonsondergang', unit: 'km', fromDay: '2026-12-07', toDay: '2026-12-13' },
    { week: '2026-W51', type: 'event_days', target: 5, title: 'Pakjesronde', goal: 'Rij op 5 verschillende dagen', unit: 'dagen', fromDay: '2026-12-14', toDay: '2026-12-20' },
    // Charging to 100% counts between 21 and 23 December (before Christmas Eve).
    { week: '2026-W52', type: 'full_charge', target: 100, title: 'Vol voor de feestdagen', goal: 'Laad tot 100% vóór kerstavond', unit: '%', fromDay: '2026-12-21', toDay: '2026-12-23' },
    { week: '2026-W53', type: 'max_km', target: 150, title: 'Oliebollenweek', goal: 'Rij deze week minder dan 150 km', unit: 'km', fromDay: '2026-12-28', toDay: '2027-01-01' },
  ],
};

/** The themed challenge for an ISO week, if that week has one. */
export function eventChallengeForWeek(week: string): EventChallengeDef | null {
  for (const list of Object.values(WINTERRIT_SCHEDULE)) {
    const found = list.find((c) => c.week === week);
    if (found) return found;
  }
  return null;
}

export function isEventChallengeType(type: string): type is EventChallengeType {
  return type === 'lights_km' || type === 'event_days' || type === 'full_charge' || type === 'max_km';
}

// ---------- event badges ----------

/** Id of a Winterrit badge, e.g. "winterrit_2026_kerstrit". */
export const winterBadgeId = (year: number, key: string) => `winterrit_${year}_${key}`;

/** Driving reach time on a day (≥ 1 km), or null. */
const reachOn = (ctx: BadgeContext, days: string[]): number | null => {
  const reach = dayReachTimes(ctx.progress, STREAK_MIN_KM);
  const times = days.map((d) => reach.get(d)).filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : null;
};

/** Trip blocks (≥ 2 readings) that start on one of `days` and pass `test`; the first confirmation time. */
function tripOn(ctx: BadgeContext, days: string[], test: (start: number) => boolean): number | null {
  for (const t of ctx.trips) {
    if (t.readings < MIN_READINGS_FOR_TIME_BADGES || t.confirmedTs === null) continue;
    if (!days.includes(dayKey(t.start, ctx.timeZone))) continue;
    if (test(t.start)) return t.confirmedTs;
  }
  return null;
}

/** Badge definitions of one Winterrit year; they can only be achieved during that event. */
export function winterritBadges(inst: EventInstance): BadgeDef[] {
  const y = inst.year;
  const within = (ts: number | null) => (ts !== null && ts >= inst.start && ts < inst.end ? ts : null);
  const schedule = WINTERRIT_SCHEDULE[y] ?? null;
  const challengeDone = (ctx: BadgeContext, type: EventChallengeType) => {
    const def = schedule?.find((c) => c.type === type);
    return def ? ctx.challenges.find((c) => c.week === def.week)?.completedTs ?? null : null;
  };
  const base = { category: 'evenementen' as const, availableFrom: inst.start, availableUntil: inst.end };
  const defs: BadgeDef[] = [
    { ...base, id: winterBadgeId(y, 'pakjesavondrit'), name: `Pakjesavondrit ${y}`, description: 'Minstens 1 km gereden op 6 december.', hint: 'Rij een stukje op 6 december.', xp: 50, requires: ['odometer'], icon: 'gift', check: (c) => within(reachOn(c, [`${y}-12-06`])) },
    { ...base, id: winterBadgeId(y, 'kerstrit'), name: `Kerstrit ${y}`, description: 'Minstens 1 km gereden op eerste of tweede kerstdag.', hint: 'Rij een stukje op 25 of 26 december.', xp: 75, requires: ['odometer'], icon: 'xmasTree', check: (c) => within(reachOn(c, [`${y}-12-25`, `${y}-12-26`])) },
    { ...base, id: winterBadgeId(y, 'witte_kerst'), name: `Witte kerst ${y}`, description: 'Een rit tussen 24 en 26 december die begon bij een temperatuur onder 0 °C.', hint: '???', hidden: true, xp: 150, requires: ['odometer', 'temperature'], icon: 'snowflakeBig', check: (c) => within(tripOn(c, [`${y}-12-24`, `${y}-12-25`, `${y}-12-26`], (ts) => { const t = temperatureAt(c.temperature, ts); return t !== null && t < 0; })) },
    { ...base, id: winterBadgeId(y, 'rendier_express'), name: `Rendier-express ${y}`, description: 'Minstens 1.000 km gereden tijdens de Winterrit.', hint: 'Rij 1.000 km tijdens de Winterrit.', xp: 200, requires: ['odometer'], icon: 'reindeer', check: (c) => within(firstGroupCrossing(c.progress, (d) => (d >= inst.startDay && d <= inst.endDay ? inst.id : null), 1000)), progress: (c) => {
      const km = [...c.dailyTotals].filter(([d]) => d >= inst.startDay && d <= inst.endDay).reduce((s, [, v]) => s + v, 0);
      return { current: Math.min(1000, Math.floor(km)), target: 1000, unit: 'km' };
    } },
    { ...base, id: winterBadgeId(y, 'oudejaarsrit'), name: `Oudejaarsrit ${y}`, description: 'Een rit op 31 december die begon vóór 18:00.', hint: 'Rij overdag op oudejaarsdag.', xp: 50, requires: ['odometer'], icon: 'clock', check: (c) => within(tripOn(c, [`${y}-12-31`], (ts) => localHour(ts, c.timeZone) < 18)) },
  ];
  if (schedule) {
    defs.push(
      { ...base, id: winterBadgeId(y, 'lichtjesjager'), name: `Lichtjesjager ${y}`, description: 'De uitdaging Lichtjesroute gehaald.', hint: 'Haal de uitdaging Lichtjesroute.', xp: 100, requires: ['odometer'], icon: 'lights', check: (c) => within(challengeDone(c, 'lights_km')) },
      { ...base, id: winterBadgeId(y, 'kerstster'), name: `Kerstster ${y}`, description: 'Alle vier de Winterrit-uitdagingen gehaald.', hint: 'Haal alle vier de Winterrit-uitdagingen.', xp: 250, requires: ['odometer'], icon: 'star', check: (c) => {
        const times = schedule.map((def) => c.challenges.find((ch) => ch.week === def.week)?.completedTs ?? null);
        return times.every((t) => t !== null) ? within(Math.max(...(times as number[]))) : null;
      }, progress: (c) => ({ current: schedule.filter((def) => c.challenges.some((ch) => ch.week === def.week)).length, target: schedule.length, unit: 'uitdagingen' }) },
    );
  }
  return defs;
}

/** Badges of every event occurrence that has started (see startedEvents). */
export function eventBadges(now: number, since: number | null, timeZone: string): BadgeDef[] {
  return startedEvents(now, since, timeZone).flatMap((inst) => (inst.eventId === WINTERRIT.id ? winterritBadges(inst) : []));
}

// ---------- advent calendar ----------

/** Doors of the advent calendar: 6 up to and including 31 December. */
export const ADVENT_FIRST_DAY = 6;
export const ADVENT_LAST_DAY = 31;
export const ADVENT_XP = 10;

export function adventDays(year: number): string[] {
  const out: string[] = [];
  for (let d = ADVENT_FIRST_DAY; d <= ADVENT_LAST_DAY; d++) out.push(`${year}-12-${String(d).padStart(2, '0')}`);
  return out;
}

/** Whether the advent calendar is shown on a day (6–31 December). */
export function adventVisible(day: string): boolean {
  return day.slice(5, 7) === '12' && Number(day.slice(8)) >= ADVENT_FIRST_DAY;
}

export interface AdventFactInput {
  day: string;
  /** Km per day (from the first measurement). */
  dailyTotals: Map<string, number>;
  /** Current odometer value. */
  odometer: number | null;
  /** Finished charging sessions this year (null without charging sensors). */
  sessionsThisYear: number | null;
}

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

/** Legs between world-trip destinations, for comparisons such as "Amsterdam – Rome". */
const COMPARISONS: { km: number; text: string }[] = [
  { km: 1_650, text: 'van Amsterdam naar Rome' },
  { km: 3_940, text: 'de hele Route 66' },
  { km: 5_860, text: 'hemelsbreed van Amsterdam naar New York' },
  { km: 9_289, text: 'de Trans-Siberië Express' },
  { km: 16_600, text: 'hemelsbreed van Amsterdam naar Sydney' },
];

/**
 * A short fact for an advent door, based on the user's own data or on the
 * world-trip distances. Deterministic per day.
 */
export function adventFact(input: AdventFactInput): string {
  const { day, dailyTotals } = input;
  const month = day.slice(0, 7);
  const year = day.slice(0, 4);
  let monthKm = 0;
  let yearKm = 0;
  let best: [string, number] | null = null;
  for (const [d, km] of dailyTotals) {
    if (d > day) continue;
    if (d.startsWith(month)) monthKm += km;
    if (d.startsWith(year)) {
      yearKm += km;
      if (!best || km > best[1]) best = [d, km];
    }
  }
  const facts: string[] = [];
  const cmp = [...COMPARISONS].reverse().find((c) => yearKm >= c.km);
  if (cmp) facts.push(`Dit jaar reed je al ${nf.format(yearKm)} km: verder dan ${cmp.text}.`);
  const monthCmp = [...COMPARISONS].reverse().find((c) => monthKm >= c.km);
  if (monthCmp) facts.push(`Deze maand reed je al net zo ver als ${monthCmp.text}.`);
  else if (monthKm > 0) facts.push(`Deze maand reed je al ${nf.format(monthKm)} km. Nog ${nf.format(1_650 - monthKm)} km en je bent in Rome.`);
  if (best) {
    const [y, m, d] = best[0].split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    facts.push(`Je langste dag dit jaar: ${nf.format(best[1])} km op ${date}.`);
  }
  if (input.sessionsThisYear) facts.push(`Je laadde dit jaar al ${input.sessionsThisYear} keer.`);
  const next = input.odometer !== null ? WORLD_TRIP.find((w) => w.km > input.odometer!) : undefined;
  if (next) facts.push(`Nog ${nf.format(next.km - input.odometer!)} km tot de volgende Wereldreis-bestemming: ${next.name}.`);
  facts.push('Een rendier loopt zo’n 5.000 km per jaar. Hoe ver kom jij deze winter?');
  // Rotate through the facts per day, so each door shows something different.
  return facts[Number(day.slice(8)) % facts.length];
}
