import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { seedMockData } from '../src/mock/seed.ts';
import { MOCK_OPTIONS_RAW, parseOptions } from '../src/options.ts';
import { ReadingStore } from '../src/readings.ts';

const TZ = 'Europe/Amsterdam';

/** An app with fictional mock data, with the clock set to a local time in Amsterdam (CET). */
function appAt(localIso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${localIso}+01:00`));
  const options = parseOptions(MOCK_OPTIONS_RAW);
  const db = openDatabase(':memory:');
  const store = new ReadingStore(db);
  seedMockData(store, options);
  return buildApp({
    version: 'test',
    mock: true,
    options,
    db,
    store,
    haStatus: () => ({ state: 'mock', haVersion: null, timeZone: TZ, connectedSince: null, lastError: null }),
    timeZone: () => TZ,
    backfill: { status: () => ({ state: 'done', step: null, stored: 0, startedAt: null, finishedAt: null, error: null }), run: async () => {} },
    onChange: () => () => {},
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Winterrit API', () => {
  it('is off before 6 December, with a preview that awards nothing', async () => {
    const app = appAt('2026-11-20T12:00:00');
    const ev = (await app.inject({ url: '/api/event' })).json();
    expect(ev).toMatchObject({ event: null, decorate: false, advent: null, festive: true });
    const preview = (await app.inject({ url: '/api/event?preview=1' })).json();
    expect(preview).toMatchObject({ preview: true, decorate: true, event: { id: 'winterrit_2026', name: 'Winterrit 2026' } });
    expect(preview.advent.doors).toHaveLength(26);
    expect(preview.advent.today).toBe('2026-12-13');
    expect(preview.advent.previewFact).toEqual(expect.any(String));
    const reveal = (await app.inject({ url: '/api/reveal?preview=winterrit' })).json();
    expect(reveal.theme).toBe('winter');
    expect(reveal.items.every((i: { keys: string[] }) => i.keys.length === 0)).toBe(true);
    // Outside December a door cannot be opened.
    expect((await app.inject({ method: 'POST', url: '/api/advent/open' })).statusCode).toBe(400);
  });

  it('opens today\'s advent door once, for 10 XP', async () => {
    const app = appAt('2026-12-20T09:00:00');
    const ev = (await app.inject({ url: '/api/event' })).json();
    expect(ev).toMatchObject({ event: { id: 'winterrit_2026' }, decorate: true, advent: { today: '2026-12-20' } });
    const before = (await app.inject({ url: '/api/badges' })).json().bonusXp;
    const open = await app.inject({ method: 'POST', url: '/api/advent/open' });
    expect(open.statusCode).toBe(200);
    expect(open.json()).toMatchObject({ day: '2026-12-20', opened: true, fact: expect.any(String) });
    expect((await app.inject({ method: 'POST', url: '/api/advent/open' })).statusCode).toBe(409);
    expect((await app.inject({ url: '/api/badges' })).json().bonusXp).toBe(before + 10);
    const doors = (await app.inject({ url: '/api/event' })).json().advent.doors;
    expect(doors.filter((d: { opened: boolean }) => d.opened).map((d: { day: string }) => d.day)).toEqual(['2026-12-20']);
    // Doors are not part of the reveal or the timeline.
    const reveal = (await app.inject({ url: '/api/reveal' })).json();
    expect(reveal.theme).toBe('winter');
    expect(reveal.items.some((i: { name: string }) => i.name.startsWith('Adventskalender'))).toBe(false);
  });

  it('replaces the weekly challenge with the themed one and lists the event badges', async () => {
    const app = appAt('2026-12-15T12:00:00');
    const ch = (await app.inject({ url: '/api/cockpit' })).json().challenge;
    expect(ch).toMatchObject({ week: '2026-W51', type: 'event_days', title: 'Pakjesronde', target: 5, xp: 150, event: 'Winterrit' });
    const cat = (await app.inject({ url: '/api/badges' })).json().categories.find((c: { id: string }) => c.id === 'evenementen');
    expect(cat.name).toBe('Evenementen');
    expect(cat.badges.map((b: { id: string }) => b.id)).toContain('winterrit_2026_kerstrit');
    // The hidden badge keeps its name secret until it is achieved.
    expect(cat.badges.find((b: { id: string }) => b.id === 'winterrit_2026_witte_kerst').name).toBeNull();
  });

  it('switches the decoration off with the festive mode, but keeps the calendar', async () => {
    const app = appAt('2026-12-10T12:00:00');
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { festiveMode: false } });
    const ev = (await app.inject({ url: '/api/event' })).json();
    expect(ev).toMatchObject({ festive: false, decorate: false, event: { id: 'winterrit_2026' } });
    expect(ev.advent.doors).toHaveLength(26);
    expect((await app.inject({ url: '/api/reveal' })).json().theme).toBeNull();
    expect((await app.inject({ method: 'PUT', url: '/api/settings', payload: { festiveMode: 'ja' } })).statusCode).toBe(400);
  });

  it('announces the year review on 31 December and wishes a happy new year on 1 January', async () => {
    const dec31 = appAt('2026-12-31T10:00:00');
    const items = (await dec31.inject({ url: '/api/reveal' })).json().items;
    expect(items[0]).toMatchObject({ kind: 'yearready', name: 'Je jaaroverzicht is klaar', link: { href: '#/jaar/2026' } });
    const review = (await dec31.inject({ url: '/api/year/2026' })).json().review;
    expect(review.winterrit).toMatchObject({ name: 'Winterrit 2026', doorsTotal: 26 });
    expect(review.winterrit.km).toBeGreaterThan(0);

    const jan1 = appAt('2027-01-01T09:00:00');
    const first = (await jan1.inject({ url: '/api/reveal' })).json().items[0];
    expect(first).toMatchObject({ kind: 'newyear', name: 'Gelukkig 2027!' });
    await jan1.inject({ method: 'POST', url: '/api/seen', payload: { keys: first.keys } });
    expect((await jan1.inject({ url: '/api/reveal' })).json().items.some((i: { kind: string }) => i.kind === 'newyear')).toBe(false);

    // From 2 January the event is over; missed event badges show as "Niet gehaald".
    const jan2 = appAt('2027-01-02T09:00:00');
    expect((await jan2.inject({ url: '/api/event' })).json().event).toBeNull();
    const cat = (await jan2.inject({ url: '/api/badges' })).json().categories.find((c: { id: string }) => c.id === 'evenementen');
    expect(cat.badges.some((b: { missed: boolean }) => b.missed)).toBe(true);
    expect(cat.badges.filter((b: { missed: boolean }) => b.missed).every((b: { followable: boolean }) => !b.followable)).toBe(true);
  });
});
