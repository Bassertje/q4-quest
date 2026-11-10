import type { ChargingSession } from './charging.ts';
import { co2Saved, litersSaved, type GreenFactors } from './green.ts';
import { dailyTemperatures, temperatureAt } from './temperature.ts';
import { currentStreak, periodTotals, STREAK_MIN_KM } from './distance.ts';
import { MOON_KM, WORLD_TRIP, destinationXp, type TimedValue } from './milestones.ts';
import { isoWeekStart, shiftPeriod } from './periods.ts';
import { dayProgress, dayReachTimes, firstGroupCrossing, type DayProgress } from './progress.ts';
import { addDays, dayKey, isWeekend, localHour, monthKey, weekKey, zonedMidnight } from './time.ts';
import { MIN_READINGS_FOR_TIME_BADGES, type TripBlock } from './trips.ts';

export type BadgeCategory =
  | 'rijden'
  | 'laden'
  | 'zuinigheid'
  | 'groen'
  | 'uitdagingen'
  | 'wereldreis'
  | 'legendarisch'
  /** Internal: a completed weekly challenge (100 XP), not shown in the badge grid. */
  | 'weekuitdaging';

/** A sensor key, or 'charging' for "charging power or charging state". */
export type Requirement = 'odometer' | 'soc' | 'charging' | 'temperature';

/** Everything a badge check may look at. Pure data, no I/O. */
export interface BadgeContext {
  odometer: TimedValue[];
  progress: DayProgress[];
  dailyTotals: Map<string, number>;
  trips: TripBlock[];
  /** Finished charging sessions (ongoing ones are excluded), oldest first. */
  sessions: ChargingSession[];
  soc: TimedValue[];
  /** Outdoor temperature readings (°C); empty when not configured. */
  temperature: TimedValue[];
  green: GreenFactors;
  /** Completed weekly challenges. */
  challenges: { week: string; completedTs: number }[];
  timeZone: string;
  now: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  hint: string;
  category: BadgeCategory;
  xp: number;
  requires: Requirement[];
  hidden?: boolean;
  /** Pixel-art icon id. */
  icon: string;
  /** First moment the condition was met (epoch ms), or null when not (yet) met. */
  check: (ctx: BadgeContext) => number | null;
  /** For countable badges: how far along you are right now. */
  progress?: (ctx: BadgeContext) => BadgeProgress;
}

export interface BadgeProgress {
  current: number;
  target: number;
  unit: string;
}

// ---------- helpers ----------

const today = (ctx: BadgeContext) => dayKey(ctx.now, ctx.timeZone);
const progressOf = (current: number, target: number, unit: string): BadgeProgress => ({
  current: Math.max(0, Math.min(current, target)),
  target,
  unit,
});
const sessionCount = (n: number) => (ctx: BadgeContext) => progressOf(ctx.sessions.length, n, 'sessies');
const streakProgress = (n: number) => (ctx: BadgeContext) =>
  progressOf(currentStreak(ctx.dailyTotals, today(ctx)), n, 'dagen');

const dayCrossing = (km: number) => (ctx: BadgeContext) => firstGroupCrossing(ctx.progress, (d) => d, km);

/** First moment of `n` consecutive days with ≥ 1 km. */
function streakReached(ctx: BadgeContext, n: number): number | null {
  const reach = dayReachTimes(ctx.progress, STREAK_MIN_KM);
  const days = [...reach.keys()].sort();
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    prev = day;
    if (run >= n) return reach.get(day)!;
  }
  return null;
}

/** Midnight after the 7th complete day in a row without driving. */
function restDays(ctx: BadgeContext, n: number): number | null {
  const first = ctx.progress[0]?.day;
  if (!first) return null;
  const today = dayKey(ctx.now, ctx.timeZone);
  let run = 0;
  // Only complete days count (today is still in progress).
  for (let day = first; day < today; day = addDays(day, 1)) {
    run = (ctx.dailyTotals.get(day) ?? 0) < STREAK_MIN_KM ? run + 1 : 0;
    if (run >= n) return zonedMidnight(addDays(day, 1), ctx.timeZone);
  }
  return null;
}

/** First trip block (with ≥ 2 readings) that starts in [fromHour, toHour). */
function tripStartingBetween(ctx: BadgeContext, fromHour: number, toHour: number): number | null {
  for (const t of ctx.trips) {
    if (t.readings < MIN_READINGS_FOR_TIME_BADGES || t.confirmedTs === null) continue;
    const hour = localHour(t.start, ctx.timeZone);
    if (hour >= fromHour && hour < toHour) return t.confirmedTs;
  }
  return null;
}

const nthSession = (n: number) => (ctx: BadgeContext) => ctx.sessions[n - 1]?.end ?? null;

function firstSession(ctx: BadgeContext, test: (s: ChargingSession) => boolean): number | null {
  return ctx.sessions.find(test)?.end ?? null;
}

function cumulativeKwh(ctx: BadgeContext, kwh: number): number | null {
  let sum = 0;
  for (const s of ctx.sessions) {
    sum += s.kwh ?? 0;
    if (sum >= kwh) return s.end;
  }
  return null;
}

/** A complete ISO week with ≥ 150 km and an estimate of ≤ 17 kWh/100 km. */
function ecoWeek(ctx: BadgeContext): number | null {
  const first = ctx.progress[0]?.day;
  if (!first) return null;
  const today = dayKey(ctx.now, ctx.timeZone);
  const kmPerWeek = new Map<string, number>();
  for (const [day, km] of ctx.dailyTotals) kmPerWeek.set(weekKey(day), (kmPerWeek.get(weekKey(day)) ?? 0) + km);
  const kwhPerWeek = new Map<string, number>();
  for (const s of ctx.sessions) {
    if (s.kwh === null) continue;
    const w = weekKey(dayKey(s.start, ctx.timeZone));
    kwhPerWeek.set(w, (kwhPerWeek.get(w) ?? 0) + s.kwh);
  }
  const weeks = [...kmPerWeek.keys()].sort();
  for (const w of weeks) {
    const nextMonday = isoWeekStart(shiftPeriod('week', w, 1));
    if (nextMonday > today) break; // the week is not complete yet
    const km = kmPerWeek.get(w) ?? 0;
    const kwh = kwhPerWeek.get(w) ?? 0;
    if (km >= ECO_WEEK_MIN_KM && kwh > 0 && (kwh / km) * 100 <= ECO_WEEK_MAX_KWH_PER_100) {
      return zonedMidnight(nextMonday, ctx.timeZone);
    }
  }
  return null;
}

/** A complete ISO week colder than 5 °C on average with < 20 kWh/100 km over ≥ 150 km. */
function winterWeek(ctx: BadgeContext): number | null {
  const today = dayKey(ctx.now, ctx.timeZone);
  const temps = dailyTemperatures(ctx.temperature, ctx.timeZone);
  const weeks = new Map<string, { km: number; kwh: number; temps: number[] }>();
  const get = (w: string) => {
    let v = weeks.get(w);
    if (!v) weeks.set(w, (v = { km: 0, kwh: 0, temps: [] }));
    return v;
  };
  for (const [d, km] of ctx.dailyTotals) get(weekKey(d)).km += km;
  for (const [d, t] of temps) get(weekKey(d)).temps.push(t);
  for (const s of ctx.sessions) if (s.kwh !== null) get(weekKey(dayKey(s.start, ctx.timeZone))).kwh += s.kwh;
  for (const w of [...weeks.keys()].sort()) {
    const nextMonday = isoWeekStart(shiftPeriod('week', w, 1));
    if (nextMonday > today) break;
    const v = weeks.get(w)!;
    if (!v.temps.length || v.km < WINTER_MIN_KM || v.kwh <= 0) continue;
    const avgTemp = v.temps.reduce((a, b) => a + b, 0) / v.temps.length;
    if (avgTemp < WINTER_MAX_AVG_TEMP && (v.kwh / v.km) * 100 < WINTER_MAX_KWH_PER_100) {
      return zonedMidnight(nextMonday, ctx.timeZone);
    }
  }
  return null;
}

/** First trip block (≥ 2 readings) that started below 0 °C. */
function iceColdTrip(ctx: BadgeContext): number | null {
  for (const t of ctx.trips) {
    if (t.readings < MIN_READINGS_FOR_TIME_BADGES || t.confirmedTs === null) continue;
    const temp = temperatureAt(ctx.temperature, t.start);
    if (temp !== null && temp < 0) return t.confirmedTs;
  }
  return null;
}

/** Cumulative km and charged kWh over time, for the green badges. */
function greenSteps(ctx: BadgeContext): { ts: number; km: number; kwh: number }[] {
  const steps: { ts: number; dKm: number; dKwh: number }[] = [];
  let lastDay: string | null = null;
  let lastDayKm = 0;
  for (const p of ctx.progress) {
    if (p.day !== lastDay) {
      lastDay = p.day;
      lastDayKm = 0;
    }
    steps.push({ ts: p.ts, dKm: p.dayKm - lastDayKm, dKwh: 0 });
    lastDayKm = p.dayKm;
  }
  for (const s of ctx.sessions) steps.push({ ts: s.end, dKm: 0, dKwh: s.kwh ?? 0 });
  steps.sort((a, b) => a.ts - b.ts);
  let km = 0;
  let kwh = 0;
  return steps.map((s) => ({ ts: s.ts, km: (km += s.dKm), kwh: (kwh += s.dKwh) }));
}

const co2Crossing = (kg: number) => (ctx: BadgeContext) =>
  greenSteps(ctx).find((s) => co2Saved(s.km, s.kwh, ctx.green) >= kg)?.ts ?? null;

function co2Now(ctx: BadgeContext): number {
  const last = greenSteps(ctx).at(-1);
  return last ? Math.max(0, Math.floor(co2Saved(last.km, last.kwh, ctx.green))) : 0;
}

function litersNow(ctx: BadgeContext): number {
  const last = greenSteps(ctx).at(-1);
  return last ? Math.floor(litersSaved(last.km, ctx.green)) : 0;
}

const nthChallenge = (n: number) => (ctx: BadgeContext) =>
  [...ctx.challenges].sort((a, b) => a.completedTs - b.completedTs)[n - 1]?.completedTs ?? null;

export const WINTER_MAX_AVG_TEMP = 5;
export const WINTER_MAX_KWH_PER_100 = 20;
export const WINTER_MIN_KM = 150;
export const ECO_WEEK_MIN_KM = 150;
export const ECO_WEEK_MAX_KWH_PER_100 = 17;
export const DC_FULL_AVG_KW = 75;

// ---------- definitions ----------

export const BADGES: BadgeDef[] = [
  // Rijden
  { id: 'first_100_day', name: 'Lekker op weg', description: '100 km of meer op één dag.', hint: 'Rij 100 km op één dag.', category: 'rijden', xp: 50, requires: ['odometer'], icon: 'car', check: dayCrossing(100) },
  { id: 'day_300', name: 'Lange adem', description: '300 km of meer op één dag.', hint: 'Rij 300 km op één dag.', category: 'rijden', xp: 150, requires: ['odometer'], icon: 'gauge', check: dayCrossing(300) },
  { id: 'day_500', name: 'IJzeren zitvlees', description: '500 km of meer op één dag.', hint: 'Rij 500 km op één dag.', category: 'rijden', xp: 300, requires: ['odometer'], icon: 'flame', check: dayCrossing(500) },
  { id: 'streak_7', name: 'Gewoontedier', description: '7 dagen op rij gereden.', hint: 'Rij 7 dagen achter elkaar.', category: 'rijden', xp: 100, requires: ['odometer'], icon: 'calendar7', check: (c) => streakReached(c, 7), progress: streakProgress(7) },
  { id: 'streak_30', name: 'Onstuitbaar', description: '30 dagen op rij gereden.', hint: 'Rij 30 dagen achter elkaar.', category: 'rijden', xp: 400, requires: ['odometer'], icon: 'calendar30', check: (c) => streakReached(c, 30), progress: streakProgress(30) },
  { id: 'month_1000', name: 'Maandmonster', description: '1.000 km of meer in één kalendermaand.', hint: 'Rij 1.000 km in één maand.', category: 'rijden', xp: 200, requires: ['odometer'], icon: 'trophy', check: (c) => firstGroupCrossing(c.progress, monthKey, 1000), progress: (c) => progressOf(Math.round(periodTotals(c.dailyTotals, today(c)).month), 1000, 'km') },
  { id: 'week_1000', name: 'Week van de weg', description: '1.000 km of meer in één kalenderweek.', hint: 'Rij 1.000 km in één week.', category: 'rijden', xp: 300, requires: ['odometer'], icon: 'road', check: (c) => firstGroupCrossing(c.progress, weekKey, 1000), progress: (c) => progressOf(Math.round(periodTotals(c.dailyTotals, today(c)).week), 1000, 'km') },
  { id: 'weekend_warrior', name: 'Weekendkrijger', description: '200 km of meer in één weekend.', hint: 'Rij 200 km op zaterdag en zondag samen.', category: 'rijden', xp: 100, requires: ['odometer'], icon: 'shield', check: (c) => firstGroupCrossing(c.progress, (d) => (isWeekend(d) ? weekKey(d) : null), 200) },
  { id: 'night_owl', name: 'Nachtuil', description: 'Een rit die begon tussen 00:00 en 04:00.', hint: 'Ga midden in de nacht op pad.', category: 'rijden', xp: 75, requires: ['odometer'], icon: 'moon', check: (c) => tripStartingBetween(c, 0, 4) },
  { id: 'early_bird', name: 'Vroege vogel', description: 'Een rit die begon tussen 05:00 en 06:00.', hint: 'Vertrek heel vroeg in de ochtend.', category: 'rijden', xp: 75, requires: ['odometer'], icon: 'sunrise', check: (c) => tripStartingBetween(c, 5, 6) },
  { id: 'rest_day', name: 'Rustdag', description: '7 dagen op rij niet gereden.', hint: '???', category: 'rijden', xp: 25, requires: ['odometer'], hidden: true, icon: 'zz', check: (c) => restDays(c, 7) },

  { id: 'ice_cold', name: 'IJskoud', description: 'Een rit die begon bij een temperatuur onder 0 °C.', hint: 'Ga op pad als het vriest.', category: 'rijden', xp: 75, requires: ['odometer', 'temperature'], icon: 'snowflake', check: iceColdTrip },
  { id: 'winter_hard', name: 'Winterhard', description: `Een week met gemiddeld minder dan ${WINTER_MAX_AVG_TEMP} °C en toch een verbruik onder ${WINTER_MAX_KWH_PER_100} kWh/100 km (minstens ${WINTER_MIN_KM} km).`, hint: 'Rij een koude week toch zuinig.', category: 'rijden', xp: 150, requires: ['odometer', 'temperature', 'charging'], icon: 'snowman', check: winterWeek },

  // Laden
  { id: 'first_charge', name: 'Eerste prik', description: 'Je eerste laadsessie.', hint: 'Laad de auto op.', category: 'laden', xp: 25, requires: ['charging'], icon: 'plug', check: nthSession(1) },
  { id: 'first_dc', name: 'Snelle jongen', description: 'Je eerste DC-snellaadsessie.', hint: 'Laad een keer aan een snellader.', category: 'laden', xp: 50, requires: ['charging'], icon: 'bolt', check: (c) => firstSession(c, (s) => s.type === 'DC') },
  { id: 'charges_10', name: 'Stekkervaste I', description: '10 laadsessies.', hint: 'Laad 10 keer.', category: 'laden', xp: 50, requires: ['charging'], icon: 'battery1', check: nthSession(10), progress: sessionCount(10) },
  { id: 'charges_50', name: 'Stekkervaste II', description: '50 laadsessies.', hint: 'Laad 50 keer.', category: 'laden', xp: 150, requires: ['charging'], icon: 'battery2', check: nthSession(50), progress: sessionCount(50) },
  { id: 'charges_100', name: 'Stekkervaste III', description: '100 laadsessies.', hint: 'Laad 100 keer.', category: 'laden', xp: 300, requires: ['charging'], icon: 'battery3', check: nthSession(100), progress: sessionCount(100) },
  { id: 'full_tank', name: 'Tot de nok', description: 'Een laadsessie die eindigde op 100%.', hint: 'Laad een keer helemaal vol.', category: 'laden', xp: 50, requires: ['charging', 'soc'], icon: 'batteryFull', check: (c) => firstSession(c, (s) => (s.socEnd ?? 0) >= 100) },
  { id: 'running_on_fumes', name: 'Op de valreep', description: 'Een accupercentage van 10% of lager gemeten.', hint: 'Rij de accu bijna leeg.', category: 'laden', xp: 75, requires: ['soc'], icon: 'batteryLow', check: (c) => c.soc.find((r) => r.value <= 10)?.ts ?? null },
  { id: 'dc_150', name: 'Volle bak', description: `Gemiddeld ${DC_FULL_AVG_KW} kW of meer in één laadsessie.`, hint: 'Laad met een hoog gemiddeld vermogen.', category: 'laden', xp: 100, requires: ['charging'], icon: 'bolts', check: (c) => firstSession(c, (s) => (s.avgKw ?? 0) >= DC_FULL_AVG_KW) },
  { id: 'mwh_1', name: 'Eerste megawattuur', description: 'In totaal 1.000 kWh geladen.', hint: 'Laad in totaal 1.000 kWh.', category: 'laden', xp: 250, requires: ['charging'], icon: 'medal', check: (c) => cumulativeKwh(c, 1000), progress: (c) => progressOf(Math.round(c.sessions.reduce((sum, s) => sum + (s.kwh ?? 0), 0)), 1000, 'kWh') },

  // Groen
  { id: 'green_start', name: 'Groene start', description: '100 kg CO₂ bespaard ten opzichte van een benzineauto.', hint: 'Bespaar 100 kg CO₂.', category: 'groen', xp: 50, requires: ['odometer', 'charging'], icon: 'seedling', check: co2Crossing(100), progress: (c) => progressOf(co2Now(c), 100, 'kg') },
  { id: 'first_ton', name: 'Eerste ton', description: '1.000 kg CO₂ bespaard.', hint: 'Bespaar een ton CO₂.', category: 'groen', xp: 200, requires: ['odometer', 'charging'], icon: 'weight', check: co2Crossing(1000), progress: (c) => progressOf(co2Now(c), 1000, 'kg') },
  { id: 'climate_champion', name: 'Klimaatkampioen', description: '5.000 kg CO₂ bespaard.', hint: 'Bespaar 5 ton CO₂.', category: 'groen', xp: 500, requires: ['odometer', 'charging'], icon: 'globeLeaf', check: co2Crossing(5000), progress: (c) => progressOf(co2Now(c), 5000, 'kg') },
  { id: 'never_refuel', name: 'Nooit meer tanken', description: '1.000 liter benzine niet verbrand.', hint: 'Rij 1.000 liter benzine bij elkaar.', category: 'groen', xp: 250, requires: ['odometer'], icon: 'pumpX', check: (c) => greenSteps(c).find((s) => litersSaved(s.km, c.green) >= 1000)?.ts ?? null, progress: (c) => progressOf(litersNow(c), 1000, 'l') },

  // Uitdagingen
  { id: 'challenger', name: 'Uitdager', description: '10 weekuitdagingen gehaald.', hint: 'Haal 10 weekuitdagingen.', category: 'uitdagingen', xp: 150, requires: ['odometer'], icon: 'target', check: nthChallenge(10), progress: (c) => progressOf(c.challenges.length, 10, 'uitdagingen') },
  { id: 'persistent', name: 'Doorzetter', description: '25 weekuitdagingen gehaald.', hint: 'Haal 25 weekuitdagingen.', category: 'uitdagingen', xp: 300, requires: ['odometer'], icon: 'boot', check: nthChallenge(25), progress: (c) => progressOf(c.challenges.length, 25, 'uitdagingen') },
  { id: 'challenge_year', name: 'Een jaar vol uitdagingen', description: '52 weekuitdagingen gehaald.', hint: 'Haal 52 weekuitdagingen.', category: 'uitdagingen', xp: 600, requires: ['odometer'], icon: 'calendar52', check: nthChallenge(52), progress: (c) => progressOf(c.challenges.length, 52, 'uitdagingen') },

  // Legendarisch
  { id: 'moon_trip', name: 'Maanreis', description: 'De afstand tot de maan op de teller: 384.400 km.', hint: 'Rij in totaal de afstand tot de maan (384.400 km).', category: 'legendarisch', xp: 5000, requires: ['odometer'], icon: 'moonTrip', check: (c) => c.odometer.find((r) => r.value >= MOON_KM)?.ts ?? null, progress: (c) => progressOf(Math.floor(c.odometer.at(-1)?.value ?? 0), MOON_KM, 'km') },

  // Zuinigheid
  { id: 'eco_week', name: 'Zuinige week', description: `Een week met een geschat verbruik van ${ECO_WEEK_MAX_KWH_PER_100} kWh/100 km of minder (minstens ${ECO_WEEK_MIN_KM} km).`, hint: 'Rij een week lang zuinig.', category: 'zuinigheid', xp: 100, requires: ['charging'], icon: 'leaf', check: ecoWeek },
];

/**
 * World-trip badges: one per destination, with its story as description and
 * hint. XP = distance in km ÷ 10.
 */
export function worldTripBadges(): BadgeDef[] {
  return WORLD_TRIP.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.story,
    hint: d.story,
    category: 'wereldreis' as const,
    xp: destinationXp(d.km),
    requires: ['odometer' as const],
    icon: d.icon,
    check: (c: BadgeContext) => c.odometer.find((r) => r.value >= d.km)?.ts ?? null,
    progress: (c: BadgeContext) => progressOf(Math.floor(c.odometer.at(-1)?.value ?? 0), d.km, 'km'),
  }));
}

export interface BadgeResult {
  id: string;
  name: string;
  description: string;
  hint: string;
  category: BadgeCategory;
  xp: number;
  hidden: boolean;
  icon: string;
  unlockedTs: number | null;
  /** Progress towards a countable badge (null for other badges). */
  progress: BadgeProgress | null;
}

export interface BadgeInput extends Omit<BadgeContext, 'progress'> {
  /** Which requirements are available (configured sensors). */
  available: Set<Requirement>;
}

/** Evaluate all badges whose required sensors are configured. */
export function evaluateBadges(input: BadgeInput): BadgeResult[] {
  const ctx: BadgeContext = { ...input, progress: dayProgress(input.odometer, input.timeZone) };
  return [...BADGES, ...worldTripBadges()]
    .filter((b) => b.requires.every((r) => input.available.has(r)))
    .map((b) => {
      const ts = b.check(ctx);
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        hint: b.hint,
        category: b.category,
        xp: b.xp,
        hidden: b.hidden ?? false,
        icon: b.icon,
        unlockedTs: ts !== null && ts <= input.now ? ts : null,
        progress: b.progress ? b.progress(ctx) : null,
      };
    });
}

/** Bonus XP events (unlocked badges with XP), oldest first. */
export function bonusEvents(results: BadgeResult[]): { ts: number; xp: number }[] {
  return results
    .filter((r) => r.unlockedTs !== null && r.xp > 0)
    .map((r) => ({ ts: r.unlockedTs!, xp: r.xp }))
    .sort((a, b) => a.ts - b.ts);
}
