import type { ChargingSession } from './charging.ts';

/**
 * Laadbingo ("charging bingo"): a 10×10 card with the numbers 1–99 in rows of
 * ten (row 1: 1–10, … row 10: 91–99) and a free square ★ on the 100th place.
 * A square is stamped when a valid charging session starts at exactly that
 * rounded SoC percentage. Pure functions: everything is derived from the
 * sessions, so it is recalculated retroactively.
 */

export const BINGO_SIZE = 10;
/** Cell number of the free square (100th position, always stamped). */
export const FREE = 100;
export const BINGO_NUMBERS = 99;
export const BINGO_LINE_XP = 150;
export const BINGO_CARD_XP = 1000;

export type LineKind = 'row' | 'column' | 'diagonal';

export interface BingoLine {
  /** E.g. "row-7", "col-3", "diag-down", "diag-up". */
  id: string;
  kind: LineKind;
  /** Cell numbers 1–100 (100 = ★). */
  cells: number[];
  /** "rij 61–70", "kolom …3", "diagonaal ↘". */
  label: string;
}

/** Row and column (0-based) of a cell number 1–100. */
export const cellPos = (n: number) => ({ row: Math.floor((n - 1) / BINGO_SIZE), col: (n - 1) % BINGO_SIZE });

/** All 22 lines: 10 rows, 10 columns, 2 diagonals. Ties are broken in this order. */
export const BINGO_LINES: BingoLine[] = (() => {
  const lines: BingoLine[] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    const cells = Array.from({ length: BINGO_SIZE }, (_, c) => r * BINGO_SIZE + c + 1);
    lines.push({ id: `row-${r + 1}`, kind: 'row', cells, label: `rij ${r * 10 + 1}–${Math.min(r * 10 + 10, BINGO_NUMBERS)}` });
  }
  for (let c = 0; c < BINGO_SIZE; c++) {
    const cells = Array.from({ length: BINGO_SIZE }, (_, r) => r * BINGO_SIZE + c + 1);
    lines.push({ id: `col-${c + 1}`, kind: 'column', cells, label: `kolom …${(c + 1) % 10}` });
  }
  lines.push({ id: 'diag-down', kind: 'diagonal', cells: Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + i + 1), label: 'diagonaal ↘' });
  lines.push({ id: 'diag-up', kind: 'diagonal', cells: Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + (BINGO_SIZE - 1 - i) + 1), label: 'diagonaal ↙' });
  return lines;
})();

/** Rounded start percentage of a session, when it is on the card (1–99). */
export function bingoNumber(s: ChargingSession): number | null {
  if (s.socStart === null) return null;
  const n = Math.round(s.socStart);
  return n >= 1 && n <= BINGO_NUMBERS ? n : null;
}

export interface BingoStamp {
  n: number;
  /** Start of the session that stamped the square first on this card. */
  ts: number;
}

export interface BingoLineDone {
  lineId: string;
  kind: LineKind;
  label: string;
  ts: number;
}

export interface BingoCard {
  /** 1, 2, … */
  index: number;
  /** Sessions from this moment count for this card (null for the first card). */
  startTs: number | null;
  /** Moment the card was full (null while it is still being filled). */
  completedTs: number | null;
  /** Stamped squares (excluding ★), in stamp order. */
  stamps: BingoStamp[];
  /** Completed lines, in order. */
  lines: BingoLineDone[];
}

export interface BingoState {
  cards: BingoCard[];
  /** All-time count of valid sessions per start percentage (index 1–99). */
  counts: number[];
  /** Moments a single session completed two or more lines at once (Kruisbingo). */
  crossTs: number[];
  /** Moments a percentage reached 10 and 25 starts (first time, any percentage). */
  countReached: { 10: number | null; 25: number | null };
}

/**
 * Walk the valid, finished sessions in start order and fill the cards.
 * A full card starts the next card: only sessions after the completing
 * session count for it; the all-time counts continue.
 */
export function buildBingo(sessions: ChargingSession[]): BingoState {
  const valid = sessions.filter((s) => !s.ongoing && bingoNumber(s) !== null).sort((a, b) => a.start - b.start);
  const counts = new Array<number>(BINGO_NUMBERS + 1).fill(0);
  const countReached: BingoState['countReached'] = { 10: null, 25: null };
  const crossTs: number[] = [];
  const cards: BingoCard[] = [];
  let card: BingoCard = { index: 1, startTs: null, completedTs: null, stamps: [], lines: [] };
  let stamped = new Set<number>([FREE]);
  cards.push(card);

  for (const s of valid) {
    const n = bingoNumber(s)!;
    counts[n]++;
    for (const goal of [10, 25] as const) if (counts[n] === goal && countReached[goal] === null) countReached[goal] = s.start;
    if (stamped.has(n)) continue;
    stamped.add(n);
    card.stamps.push({ n, ts: s.start });
    const newly = BINGO_LINES.filter((l) => l.cells.includes(n) && l.cells.every((c) => stamped.has(c)));
    for (const l of newly) card.lines.push({ lineId: l.id, kind: l.kind, label: l.label, ts: s.start });
    if (newly.length >= 2) crossTs.push(s.start);
    if (card.stamps.length === BINGO_NUMBERS) {
      card.completedTs = s.start;
      card = { index: card.index + 1, startTs: s.start, completedTs: null, stamps: [], lines: [] };
      stamped = new Set<number>([FREE]);
      cards.push(card);
    }
  }
  return { cards, counts, crossTs, countReached };
}

/** Number of stamped cells (including ★) per line on a card. */
export function lineFill(card: BingoCard, line: BingoLine): number {
  const stamped = new Set(card.stamps.map((s) => s.n));
  return line.cells.filter((c) => c === FREE || stamped.has(c)).length;
}

/**
 * The line closest to a bingo: the fewest open squares (completed lines are
 * skipped). On a tie a row goes before a column before a diagonal, and then
 * the first one on the card.
 */
export function closestLine(card: BingoCard): { line: BingoLine; open: number } | null {
  const done = new Set(card.lines.map((l) => l.lineId));
  let best: { line: BingoLine; open: number } | null = null;
  for (const line of BINGO_LINES) {
    if (done.has(line.id)) continue;
    const open = BINGO_SIZE - lineFill(card, line);
    if (!best || open < best.open) best = { line, open };
  }
  return best;
}

/** Start percentage with the highest all-time count (lowest on a tie), or null without sessions. */
export function mostFrequent(counts: number[]): { n: number; count: number } | null {
  let best: { n: number; count: number } | null = null;
  for (let n = 1; n <= BINGO_NUMBERS; n++) if (counts[n] > 0 && (!best || counts[n] > best.count)) best = { n, count: counts[n] };
  return best;
}

/** Bonus XP items (150 per line, 1,000 per full card), for the level. */
export function bingoBonuses(state: BingoState): { id: string; name: string; xp: number; ts: number; kind: 'line' | 'card' }[] {
  const out: { id: string; name: string; xp: number; ts: number; kind: 'line' | 'card' }[] = [];
  for (const c of state.cards) {
    for (const l of c.lines) out.push({ id: `bingo_${c.index}_${l.lineId}`, name: `BINGO! ${capitalise(l.label)}`, xp: BINGO_LINE_XP, ts: l.ts, kind: 'line' });
    if (c.completedTs !== null) out.push({ id: `bingo_${c.index}_full`, name: `Kaart ${c.index} vol!`, xp: BINGO_CARD_XP, ts: c.completedTs, kind: 'card' });
  }
  return out;
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The nine "double" numbers for Dubbelgangers. */
export const DOUBLES = [11, 22, 33, 44, 55, 66, 77, 88, 99];
