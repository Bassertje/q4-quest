import { describe, expect, it } from 'vitest';
import type { BadgeResult } from '../src/badges.ts';
import { revealItems, type RecordEntry } from '../src/reveal.ts';
import { timeline } from '../src/timeline.ts';

const badge = (id: string, unlockedTs: number | null, category: BadgeResult['category'] = 'rijden'): BadgeResult => ({
  id, name: id, description: '', hint: '', category, xp: category === 'wereldreis' ? 0 : 50, hidden: false, icon: 'car', unlockedTs, progress: null,
});

describe('revealItems', () => {
  const odo = [
    { ts: 1, value: 650 }, // level 3 at the first reading
    { ts: 5, value: 1_010 }, // level 4 and the 1,000 km milestone
  ];
  const badges = [badge('first_100_day', 3), badge('day_300', null), badge('milestone_1000', 5, 'wereldreis')];
  const records: RecordEntry[] = [{ key: 'record:bestDay:2026-03-02', name: 'Beste dag', value: '360 km', label: 'ma 2 maart 2026', ts: 4 }];
  const t = timeline(odo, badges);

  it('lists unseen badges, milestones, one combined level item and records, oldest first', () => {
    const items = revealItems({ badges, timeline: t, records, seen: new Set(), now: 100 });
    expect(items.map((i) => i.kind)).toEqual(['badge', 'record', 'milestone', 'level']);
    const level = items.find((i) => i.kind === 'level')!;
    // 650 + 50 bonus XP at ts 3 → still level 3; 1,010 + 50 = 1,060 → level 4.
    expect(level.name).toBe('Level 4');
    expect(level.keys).toEqual(['level:1', 'level:2', 'level:3', 'level:4']);
    expect(level.description).toContain('4 levels omhoog');
  });

  it('adds one item for the highest new rank', () => {
    const odo2 = [
      { ts: 1, value: 50 },
      { ts: 5, value: 1_600 }, // level 5: Pendelaar
    ];
    const t2 = timeline(odo2, []);
    const items = revealItems({ badges: [], timeline: t2, records: [], seen: new Set(), now: 9 });
    const rank = items.filter((i) => i.kind === 'rank');
    expect(rank).toHaveLength(1);
    expect(rank[0]).toMatchObject({ name: 'Pendelaar', icon: 'briefcase', keys: ['rank:Pendelaar'] });
    // Shown after the level item of the same moment.
    expect(items.at(-1)?.kind).toBe('rank');
    const again = revealItems({ badges: [], timeline: t2, records: [], seen: new Set(['rank:Pendelaar', ...items.flatMap((i) => i.keys)]), now: 9 });
    expect(again).toEqual([]);
  });

  it('puts the weekly review first and shows completed challenges as challenge items', () => {
    const challenge = { ...badge('challenge_2026-W45', 3), category: 'weekuitdaging' as const, xp: 100 };
    const items = revealItems({
      badges: [badge('first_100_day', 2), challenge],
      timeline: { initial: [], events: [] },
      records: [],
      seen: new Set(),
      now: 9,
      weekReview: { week: '2026-W45', km: 312, sessions: 3, factKind: 'bestDay', fact: 'Beste dag: dinsdag met 120 km' },
    });
    expect(items.map((i) => i.kind)).toEqual(['week', 'badge', 'challenge']);
    expect(items[0]).toMatchObject({ keys: ['week:2026-W45'], name: 'Vorige week', stats: [{ label: 'Gereden', value: '312 km' }, { label: 'Laadsessies', value: '3' }] });
    const seen = revealItems({ badges: [], timeline: { initial: [], events: [] }, records: [], seen: new Set(['week:2026-W45']), now: 9, weekReview: items[0] && { week: '2026-W45', km: 1, sessions: null, factKind: 'quiet', fact: '' } });
    expect(seen).toEqual([]);
  });

  it('skips what has been seen', () => {
    const seen = new Set(['badge:first_100_day', 'level:1', 'level:2', 'level:3', 'record:bestDay:2026-03-02']);
    // (No rank item here: levels 1–4 stay within the starting rank Leerling.)
    const items = revealItems({ badges, timeline: t, records, seen, now: 100 });
    expect(items.map((i) => i.keys)).toEqual([['badge:milestone_1000'], ['level:4']]);
  });

  it('shows a new record again when the record moves to another period', () => {
    const seen = new Set(['record:bestDay:2026-03-02']);
    const moved = [{ ...records[0], key: 'record:bestDay:2026-03-09' }];
    expect(revealItems({ badges: [], timeline: { initial: [], events: [] }, records: moved, seen, now: 1 })).toHaveLength(1);
  });
});
