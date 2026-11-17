import type { DatabaseSync } from 'node:sqlite';
import {
  activeEvent,
  adventDays,
  adventFact,
  adventVisible,
  dayKey,
  eventInstance,
  WINTERRIT,
  type EventInstance,
  type RevealItem,
} from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';

export interface EventView {
  id: string;
  name: string;
  year: number;
  startDay: string;
  endDay: string;
  theme: 'winter';
}

export interface AdventDoorView {
  day: string;
  opened: boolean;
  /** The fact behind an opened door. */
  fact: string | null;
}

export interface EventResponse {
  /** "Feestmodus": decoration on or off (challenges and badges work either way). */
  festive: boolean;
  /** The response is a preview ("Voorbeeld Winterrit"): nothing is stored or awarded. */
  preview: boolean;
  /** The running event (in a preview: this year's Winterrit). */
  event: EventView | null;
  /** Show the decoration: an event is running (or previewed) and the festive mode is on. */
  decorate: boolean;
  today: string;
  /** Advent calendar, shown from 6 up to and including 31 December. */
  advent: {
    year: number;
    today: string;
    doors: AdventDoorView[];
    /** Fact for today's door in a preview (the door is opened in the browser only). */
    previewFact: string | null;
  } | null;
}

const view = (e: EventInstance): EventView => ({
  id: e.id,
  name: e.name,
  year: e.year,
  startDay: e.startDay,
  endDay: e.endDay,
  theme: e.theme,
});

/** The fact for a door, from the user's own data. */
function factFor(state: GameState, day: string): string {
  const year = day.slice(0, 4);
  return adventFact({
    day,
    dailyTotals: state.dailyTotals,
    odometer: state.odometer.at(-1)?.value ?? null,
    sessionsThisYear: state.sessions.length ? state.sessions.filter((s) => !s.ongoing && dayKey(s.end, state.timeZone).startsWith(year)).length : null,
  });
}

export function eventResponse(state: GameState, festive: boolean, preview: boolean): EventResponse {
  const today = dayKey(state.now, state.timeZone);
  const running = activeEvent(state.now, state.timeZone);
  const year = Number(today.slice(0, 4)) - (today.slice(5) === '01-01' ? 1 : 0);
  const inst = running ?? (preview ? eventInstance(WINTERRIT, year, state.timeZone) : null);
  let advent: EventResponse['advent'] = null;
  if (!state.setupNeeded && (adventVisible(today) || preview)) {
    // In a preview outside December, pretend it is 13 December.
    const adventToday = adventVisible(today) ? today : `${year}-12-13`;
    const opened = new Map(state.adventDoors.map((d) => [d.day, d]));
    advent = {
      year,
      today: adventToday,
      doors: adventDays(year).map((day) => {
        const d = preview ? undefined : opened.get(day);
        return { day, opened: d !== undefined, fact: d?.fact ?? null };
      }),
      previewFact: preview ? factFor(state, adventToday) : null,
    };
  }
  return {
    festive,
    preview,
    event: inst ? view(inst) : null,
    decorate: inst !== null && (festive || preview),
    today,
    advent,
  };
}

export type OpenResult = { status: 200; body: AdventDoorView } | { status: 400 | 409; body: { error: string } };

/** Open today's advent door (only on that day). Stores the fact; the 10 XP follow from the stored door. */
export function openAdventDoor(db: DatabaseSync, state: GameState): OpenResult {
  if (state.setupNeeded) return { status: 400, body: { error: 'setup needed' } };
  const day = dayKey(state.now, state.timeZone);
  if (!adventVisible(day)) return { status: 400, body: { error: 'the advent calendar is closed today' } };
  const existing = state.adventDoors.find((d) => d.day === day);
  if (existing) return { status: 409, body: { error: 'already opened' } };
  const fact = factFor(state, day);
  db.prepare('INSERT OR IGNORE INTO advent_doors (day, opened_ts, fact) VALUES (?, ?, ?)').run(day, state.now, fact);
  return { status: 200, body: { day, opened: true, fact } };
}

/**
 * Extra reveal items around the turn of the year: "your year review is ready"
 * on 31 December, and fireworks on 1 January (only with the festive mode on).
 */
export function eventRevealItems(state: GameState, festive: boolean, seen: Set<string>, yearReviewReady: (year: number) => boolean): RevealItem[] {
  const today = dayKey(state.now, state.timeZone);
  const year = Number(today.slice(0, 4));
  const out: RevealItem[] = [];
  if (today.slice(5) === '12-31' && yearReviewReady(year) && !seen.has(`yearready:${year}`)) {
    out.push({
      keys: [`yearready:${year}`],
      kind: 'yearready',
      name: 'Je jaaroverzicht is klaar',
      description: `Bekijk de hoogtepunten van ${year}.`,
      icon: 'calendar7',
      ts: state.now,
      xp: 0,
      link: { href: `#/jaar/${year}`, label: 'Naar je jaaroverzicht' },
    });
  }
  if (festive && today.slice(5) === '01-01' && !seen.has(`newyear:${year}`)) {
    out.push({ keys: [`newyear:${year}`], kind: 'newyear', name: `Gelukkig ${year}!`, description: 'Op naar een nieuw jaar vol kilometers.', icon: 'star', ts: state.now, xp: 0 });
  }
  return out;
}

/** Sample reveal items for "Voorbeeld Winterrit": nothing is marked as seen and no XP is awarded. */
export function previewRevealItems(state: GameState): RevealItem[] {
  const today = dayKey(state.now, state.timeZone);
  const year = Number(today.slice(0, 4)) - (today.slice(5) === '01-01' ? 1 : 0);
  return [
    { keys: [], kind: 'badge', name: `Kerstrit ${year}`, description: 'Minstens 1 km gereden op eerste of tweede kerstdag. (voorbeeld)', icon: 'xmasTree', ts: state.now, xp: 75 },
    { keys: [], kind: 'challenge', name: 'Winterrit: Lichtjesroute', description: 'Rij 150 km na zonsondergang. (voorbeeld)', icon: 'lights', ts: state.now, xp: 150 },
    { keys: [], kind: 'newyear', name: `Gelukkig ${year + 1}!`, description: 'Zo ziet 1 januari eruit. (voorbeeld)', icon: 'star', ts: state.now, xp: 0 },
  ];
}

/** Winterrit card for the year review: earned event badges, km during the event and opened doors. */
export function winterritSummary(state: GameState, year: number) {
  const inst = eventInstance(WINTERRIT, year, state.timeZone);
  if (state.now < inst.start) return null;
  const today = dayKey(state.now, state.timeZone);
  const last = inst.endDay < today ? inst.endDay : today;
  const km = [...state.dailyTotals].filter(([d]) => d >= inst.startDay && d <= last).reduce((s, [, v]) => s + v, 0);
  const prefix = `${WINTERRIT.id}_${year}_`;
  return {
    name: inst.name,
    km: Math.round(km),
    badges: state.badges
      .filter((b) => b.id.startsWith(prefix) && b.unlockedTs !== null)
      .map((b) => ({ id: b.id, name: b.name, icon: b.icon, xp: b.xp })),
    doorsOpened: state.adventDoors.filter((d) => d.day.startsWith(`${year}-12`)).length,
    doorsTotal: adventDays(year).length,
  };
}
