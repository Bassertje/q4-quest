import { describe, expect, it } from 'vitest';
import { evaluateBadges, type BadgeResult } from '../src/badges.ts';
import {
  BINGO_LINES,
  bingoBonuses,
  bingoNumber,
  buildBingo,
  closestLine,
  FREE,
  mostFrequent,
} from '../src/bingo.ts';
import { chargingSessions, type ChargingSession } from '../src/charging.ts';

const MIN = 60_000;
const H = 60 * MIN;

/** A fictional, finished session starting at hour `h` with a start SoC. */
function s(h: number, socStart: number | null, extra: Partial<ChargingSession> = {}): ChargingSession {
  return { start: h * H, end: h * H + H, ongoing: false, type: 'AC', typeSource: 'sensor', socStart, socEnd: 80, kwh: 20, kwhMethod: 'soc', avgKw: 11, ...extra };
}
/** Sessions that start at the given percentages, one hour apart. */
const run = (pcts: number[], from = 0) => pcts.map((p, i) => s(from + i * 2, p));

function badges(sessions: ChargingSession[]): Map<string, BadgeResult> {
  const out = evaluateBadges({
    odometer: [{ ts: 0, value: 1000 }],
    dailyTotals: new Map(),
    trips: [],
    sessions,
    soc: [],
    temperature: [],
    green: { co2PetrolKgPerKm: 0.18, co2GridKgPerKwh: 0.33, petrolLPer100km: 6.5 },
    batteryKwh: 77,
    hasSoc: true,
    challenges: [],
    timeZone: 'UTC',
    now: 10_000 * H,
    available: new Set(['odometer', 'charging', 'soc']),
  });
  return new Map(out.filter((b) => b.id.startsWith('bingo_')).map((b) => [b.id, b]));
}
const row = (r: number) => Array.from({ length: 10 }, (_, c) => r * 10 + c + 1).filter((n) => n <= 99);
const all99 = Array.from({ length: 99 }, (_, i) => i + 1);

describe('Laadbingo card', () => {
  it('has rows of ten, columns, two diagonals and a free ★ on the 100th place', () => {
    expect(BINGO_LINES).toHaveLength(22);
    expect(BINGO_LINES[6]).toMatchObject({ id: 'row-7', label: 'rij 61–70', cells: [61, 62, 63, 64, 65, 66, 67, 68, 69, 70] });
    expect(BINGO_LINES[9].label).toBe('rij 91–99');
    expect(BINGO_LINES[9].cells.at(-1)).toBe(FREE);
    expect(BINGO_LINES[12]).toMatchObject({ id: 'col-3', label: 'kolom …3', cells: [3, 13, 23, 33, 43, 53, 63, 73, 83, 93] });
    expect(BINGO_LINES[20].cells).toEqual([1, 12, 23, 34, 45, 56, 67, 78, 89, 100]);
    expect(BINGO_LINES[21].cells).toEqual([10, 19, 28, 37, 46, 55, 64, 73, 82, 91]);
  });

  it('stamps the rounded start percentage of finished sessions with a SoC (1–99 only)', () => {
    expect(bingoNumber(s(0, 62.5))).toBe(63);
    expect(bingoNumber(s(0, 62.4))).toBe(62);
    expect(bingoNumber(s(0, 0.4))).toBeNull();
    expect(bingoNumber(s(0, 99.6))).toBeNull(); // 100: the free square is not a percentage
    expect(bingoNumber(s(0, null))).toBeNull();
    const st = buildBingo([s(0, 62.6), s(2, 63.2), s(4, 40, { ongoing: true }), s(6, null)]);
    expect(st.cards[0].stamps).toEqual([{ n: 63, ts: 0 }]); // the date of the first stamp
    expect(st.counts[63]).toBe(2);
    expect(st.counts[40]).toBe(0); // an ongoing session does not count yet
  });

  it('only counts valid sessions: a false-positive blip never reaches the card', () => {
    const sessions = chargingSessions({
      state: [
        { ts: 10 * H, state: 'charging' },
        { ts: 10 * H + 15 * MIN, state: 'not_charging' },
      ],
      type: [],
      power: [
        { ts: 10 * H, kw: 3.7 },
        { ts: 10 * H + 15 * MIN, kw: 0 },
      ],
      soc: [
        { ts: 9 * H, value: 64 },
        { ts: 10 * H + 20 * MIN, value: 63 },
      ],
      hasSoc: true,
      batteryKwh: 77,
      now: 100 * H,
    });
    expect(buildBingo(sessions).cards[0].stamps).toEqual([]);
  });

  it('keeps an all-time count per percentage across cards', () => {
    const st = buildBingo([...run(all99), ...run([50, 50, 50], 300)]);
    expect(st.counts[50]).toBe(4);
    expect(st.cards[1].stamps.map((x) => x.n)).toEqual([50]);
    expect(mostFrequent(st.counts)).toEqual({ n: 50, count: 4 });
  });

  it('detects rows, columns and diagonals (with ★) once per card', () => {
    const st = buildBingo(run([...row(6), 61]));
    expect(st.cards[0].lines).toEqual([{ lineId: 'row-7', kind: 'row', label: 'rij 61–70', ts: 9 * 2 * H }]);
    // Row 10 needs only 91–99: ★ is always stamped.
    expect(buildBingo(run(row(9))).cards[0].lines.map((l) => l.lineId)).toEqual(['row-10']);
    // The ↘ diagonal has ★ too: nine numbers are enough.
    expect(buildBingo(run([1, 12, 23, 34, 45, 56, 67, 78, 89])).cards[0].lines.map((l) => l.kind)).toEqual(['diagonal']);
    const col = buildBingo(run([3, 13, 23, 33, 43, 53, 63, 73, 83, 93]));
    expect(col.cards[0].lines[0]).toMatchObject({ lineId: 'col-3', label: 'kolom …3' });
  });

  it('notices a Kruisbingo: one session completes two lines at once', () => {
    // Row 61–70 and column …3 both miss only 63.
    const prep = [...row(6).filter((n) => n !== 63), 3, 13, 23, 33, 43, 53, 73, 83, 93];
    const st = buildBingo(run([...prep, 63]));
    expect(st.cards[0].lines.map((l) => l.lineId).sort()).toEqual(['col-3', 'row-7']);
    expect(st.crossTs).toEqual([prep.length * 2 * H]);
    expect(buildBingo(run(prep)).crossTs).toEqual([]);
  });

  it('starts card 2 after a full card, with only later sessions; earlier cards stay', () => {
    const st = buildBingo([...run(all99), ...run([7, 8], 300)]);
    expect(st.cards).toHaveLength(2);
    expect(st.cards[0]).toMatchObject({ index: 1, completedTs: 98 * 2 * H });
    expect(st.cards[0].stamps).toHaveLength(99);
    expect(st.cards[0].lines).toHaveLength(22);
    expect(st.cards[1]).toMatchObject({ index: 2, startTs: 98 * 2 * H, completedTs: null });
    expect(st.cards[1].stamps.map((x) => x.n)).toEqual([7, 8]);
    const xp = bingoBonuses(st);
    expect(xp.filter((b) => b.kind === 'line')).toHaveLength(22);
    expect(xp.find((b) => b.kind === 'card')).toMatchObject({ id: 'bingo_1_full', xp: 1000 });
    expect(xp.reduce((sum, b) => sum + b.xp, 0)).toBe(22 * 150 + 1000);
  });

  it('is computed retroactively from the session history (order does not matter)', () => {
    const sessions = run([5, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
    expect(buildBingo([...sessions].reverse())).toEqual(buildBingo(sessions));
    expect(buildBingo(sessions).cards[0].lines.map((l) => l.lineId)).toEqual(['col-5']);
  });

  it('finds the line closest to a bingo; a row wins a tie', () => {
    const st = buildBingo(run([71, 72, 73, 74, 75, 76, 77, 78, 7, 17, 27, 37, 47, 57, 67, 87]));
    // Row 71–80 misses 79 and 80; column …7 only misses 97.
    expect(closestLine(st.cards[0])).toMatchObject({ line: { id: 'col-7' }, open: 1 });
    // Row 71–80 and column …2 both miss two squares (79, 80 and 82, 92).
    const tie = buildBingo(run([71, 72, 73, 74, 75, 76, 77, 78, 2, 12, 22, 32, 42, 52, 62]));
    expect(closestLine(tie.cards[0])).toMatchObject({ line: { id: 'row-8', label: 'rij 71–80' }, open: 2 });
  });
});

describe('Laadbingo badges', () => {
  it('Eerste bingo: the first full line, with progress of the best line', () => {
    expect(badges(run([...row(2)])).get('bingo_first')?.unlockedTs).toBe(9 * 2 * H);
    const b = badges(run([21, 22, 23]));
    expect(b.get('bingo_first')).toMatchObject({ unlockedTs: null, progress: { current: 3, target: 10 } });
  });

  it('Volle kaart and Halve kaart: 99 and 50 stamps on one card (★ does not count)', () => {
    const full = badges(run(all99));
    expect(full.get('bingo_full')?.unlockedTs).toBe(98 * 2 * H);
    expect(full.get('bingo_half')?.unlockedTs).toBe(49 * 2 * H);
    const half = badges(run(all99.slice(0, 49)));
    expect(half.get('bingo_half')).toMatchObject({ unlockedTs: null, progress: { current: 49, target: 50 } });
    expect(half.get('bingo_full')?.progress).toMatchObject({ current: 49, target: 99 });
  });

  it('Vaste prik and Stamgast: 10 and 25 starts on the same percentage', () => {
    const many = run(Array(25).fill(80));
    const b = badges(many);
    expect(b.get('bingo_regular')?.unlockedTs).toBe(9 * 2 * H);
    expect(b.get('bingo_habitue')?.unlockedTs).toBe(24 * 2 * H);
    const few = badges(run([...Array(9).fill(80), ...Array(5).fill(40)]));
    expect(few.get('bingo_regular')).toMatchObject({ unlockedTs: null, progress: { current: 9, target: 10 } });
    expect(few.get('bingo_habitue')?.progress).toMatchObject({ current: 9, target: 25 });
  });

  it('Schuin gaan: the first diagonal bingo', () => {
    expect(badges(run([10, 19, 28, 37, 46, 55, 64, 73, 82, 91])).get('bingo_diagonal')?.unlockedTs).toBe(9 * 2 * H);
    expect(badges(run(row(0))).get('bingo_diagonal')?.unlockedTs).toBeNull();
  });

  it('Dubbelgangers: 11, 22, … 99 all started at least once (all-time)', () => {
    const doubles = [11, 22, 33, 44, 55, 66, 77, 88];
    const b = badges(run(doubles));
    expect(b.get('bingo_doubles')).toMatchObject({ unlockedTs: null, progress: { current: 8, target: 9 } });
    expect(badges(run([...doubles, 99])).get('bingo_doubles')?.unlockedTs).toBe(8 * 2 * H);
  });

  it('Kruisbingo (hidden): two lines in one go', () => {
    const prep = [...row(6).filter((n) => n !== 63), 3, 13, 23, 33, 43, 53, 73, 83, 93];
    expect(badges(run([...prep, 63])).get('bingo_cross')).toMatchObject({ hidden: true, unlockedTs: prep.length * 2 * H });
    expect(badges(run(prep)).get('bingo_cross')?.unlockedTs).toBeNull();
  });

  it('need a SoC sensor', () => {
    const out = evaluateBadges({
      odometer: [{ ts: 0, value: 1000 }], dailyTotals: new Map(), trips: [], sessions: [], soc: [], temperature: [],
      green: { co2PetrolKgPerKm: 0.18, co2GridKgPerKwh: 0.33, petrolLPer100km: 6.5 }, batteryKwh: 77, hasSoc: false,
      challenges: [], timeZone: 'UTC', now: H, available: new Set(['odometer', 'charging']),
    });
    expect(out.some((b) => b.id.startsWith('bingo_'))).toBe(false);
  });
});
