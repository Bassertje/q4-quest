import {
  BINGO_LINES,
  bingoBonuses,
  bingoNumber,
  buildBingo,
  closestLine,
  dayKey,
  mostFrequent,
  zonedMidnight,
  type BadgeResult,
  type BingoState,
  type ChargingSession,
  type RevealItem,
} from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';
import type { Options } from './options.ts';
import { chargingAvailable } from './charging.ts';

/** Laadbingo needs charging sessions with a start SoC. */
export function bingoAvailable(options: Options): boolean {
  return chargingAvailable(options) && options.entities.soc !== null;
}

export function bingoState(sessions: ChargingSession[], options: Options): BingoState | null {
  return bingoAvailable(options) ? buildBingo(sessions) : null;
}

/** Lines (150 XP) and full cards (1,000 XP) as internal "badges", so the XP counts for the level. */
export function bingoBonusBadges(state: BingoState | null): BadgeResult[] {
  if (!state) return [];
  return bingoBonuses(state).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.kind === 'card' ? 'Alle 99 vakjes afgestempeld. Er begint een nieuwe kaart.' : 'Een volle lijn op je Laadbingo-kaart.',
    hint: '',
    category: 'bingo',
    xp: b.xp,
    hidden: true,
    icon: b.kind === 'card' ? 'bingoFull' : 'bingoLine',
    unlockedTs: b.ts,
    progress: null,
  }));
}

/** Above this many new stamps at once, the reveal shows one combined item. */
const MAX_SINGLE_STAMPS = 3;

/** Reveal items for squares stamped since the last visit. */
export function stampRevealItems(state: BingoState | null, seen: Set<string>): RevealItem[] {
  if (!state) return [];
  const fresh = state.cards.flatMap((c) =>
    c.stamps.map((s) => ({ key: `bingo:stamp:${c.index}:${s.n}`, n: s.n, ts: s.ts, card: c.index })).filter((x) => !seen.has(x.key)),
  );
  if (fresh.length === 0) return [];
  if (fresh.length > MAX_SINGLE_STAMPS) {
    return [{
      keys: fresh.map((f) => f.key),
      kind: 'stamp',
      name: `Laadbingo: ${fresh.length} vakjes afgestempeld!`,
      description: 'Bekijk je kaart op de Laden-pagina.',
      icon: 'bingoHalf',
      ts: Math.min(...fresh.map((f) => f.ts)),
      xp: 0,
      link: { href: '#/laden/bingo', label: 'Naar de kaart' },
    }];
  }
  return fresh.map((f) => ({
    keys: [f.key],
    kind: 'stamp' as const,
    name: `Laadbingo: ${f.n}% afgestempeld!`,
    description: f.card > 1 ? `Kaart ${f.card}` : 'Een nieuw vakje op je Laadbingo-kaart.',
    icon: 'bingoLine',
    ts: f.ts,
    xp: 0,
    stamp: f.n,
  }));
}

export interface BingoResponse {
  available: boolean;
  timeZone: string;
  cards: BingoState['cards'];
  /** All-time count per start percentage (index 1–99). */
  counts: number[];
  mostFrequent: { n: number; count: number } | null;
  /** Line closest to a bingo on the current card. */
  closest: { lineId: string; label: string; open: number } | null;
  lines: { id: string; kind: string; label: string; cells: number[] }[];
}

export function bingoResponse(state: GameState, options: Options): BingoResponse {
  const b = state.bingo;
  const empty: BingoResponse = { available: false, timeZone: state.timeZone, cards: [], counts: [], mostFrequent: null, closest: null, lines: BINGO_LINES };
  if (!b || !bingoAvailable(options)) return empty;
  const c = closestLine(b.cards.at(-1)!);
  return {
    ...empty,
    available: true,
    cards: b.cards,
    counts: b.counts,
    mostFrequent: mostFrequent(b.counts),
    closest: c ? { lineId: c.line.id, label: c.line.label, open: c.open } : null,
  };
}

/** Laadbingo card for the year review: stamps, bingos and the most charged percentage of that year, plus the card at the end of it. */
export function bingoYearSummary(state: GameState, year: number) {
  const b = state.bingo;
  if (!b) return null;
  const from = zonedMidnight(`${year}-01-01`, state.timeZone);
  const to = zonedMidnight(`${year + 1}-01-01`, state.timeZone);
  const inYear = (ts: number) => ts >= from && ts < to;
  const stamps = b.cards.reduce((s, c) => s + c.stamps.filter((x) => inYear(x.ts)).length, 0);
  const bingos = b.cards.reduce((s, c) => s + c.lines.filter((x) => inYear(x.ts)).length, 0);
  const counts = new Array<number>(100).fill(0);
  for (const s of state.sessions) {
    const n = bingoNumber(s);
    if (n !== null && !s.ongoing && inYear(s.start)) counts[n]++;
  }
  if (stamps === 0 && counts.every((x) => x === 0)) return null;
  // The card as it was at the end of the year (or now).
  const card = [...b.cards].reverse().find((c) => c.startTs === null || c.startTs < to)!;
  return {
    stamps,
    bingos,
    mostFrequent: mostFrequent(counts),
    card: { index: card.index, stamped: card.stamps.filter((x) => x.ts < to).map((x) => x.n) },
    year,
    today: dayKey(state.now, state.timeZone),
  };
}
