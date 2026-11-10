import { describe, expect, it } from 'vitest';
import { shareContent } from './shareCard.ts';
import type { YearReview } from './types';

// Fictional review data.
const review: YearReview = {
  year: 2026,
  from: '2026-07-13',
  to: '2026-11-10',
  startedThisYear: true,
  running: true,
  totalKm: 10_133,
  daysDriven: 99,
  bestDay: { key: '2026-09-11', km: 508 },
  bestWeek: { key: '2026-W37', km: 1_164 },
  longestStreak: { days: 18, start: '2026-10-14', end: '2026-10-31' },
  charging: { sessions: 51, kwh: 1_767, ac: { sessions: 37, kwh: 1_081 }, dc: { sessions: 14, kwh: 686 } },
  newBadges: Array.from({ length: 23 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, icon: 'car', category: 'rijden', xp: 10, ts: 1 })),
  level: { start: 13, end: 21, startRank: 'Wegvreter', endRank: 'Snelwegridder', xpGained: 14_758 },
  earth: { km: 40_075, laps: 0.25 },
  green: { co2Kg: 1_241, liters: 659, trees: 62.1 },
  challengesDone: 7,
};

describe('shareContent', () => {
  const c = shareContent(review);

  it('shows the year totals and highlights', () => {
    expect(c.year).toBe('2026');
    expect(c.kmDigits).toBe('10133');
    expect(c.tiles.map((t) => [t.label, t.value])).toEqual([
      ['Beste dag', '508'],
      ['Beste week', '1.164'],
      ['Langste streak', '18'],
      ['Laadsessies', '51'],
      ['Geladen (schatting)', '1.767'],
      ['AC / DC', '73/27'],
      ['Level', '21'],
      ['Rang', 'Snelwegridder'],
    ]);
    expect(c.green.map((t) => [t.label, t.value])).toEqual([
      ['CO₂ bespaard', '1.241'],
      ['Niet verbrand', '659'],
      ['Gelijk aan', '62,1'],
    ]);
    expect(c.badges).toHaveLength(20);
    expect(c.moreBadges).toBe(3);
  });

  it('contains no dates, times or odometer values', () => {
    const text = JSON.stringify(c);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no day keys
    expect(text).not.toMatch(/W\d{2}/); // no week keys
    expect(text).not.toMatch(/\d{1,2}:\d{2}/); // no times
    expect(text).not.toMatch(/september|oktober/i);
  });

  it('shows dashes without charging data', () => {
    const none = shareContent({ ...review, charging: null });
    expect(none.tiles.find((t) => t.label === 'AC / DC')?.value).toBe('–');
  });
});
