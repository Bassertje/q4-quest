import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { backoffDelay, toWebSocketUrl } from '../src/ha/client.ts';
import { seedMockData } from '../src/mock/seed.ts';
import { MOCK_OPTIONS_RAW, parseOptions } from '../src/options.ts';
import { ReadingStore } from '../src/readings.ts';

function make(raw: unknown, seed = false) {
  const db = openDatabase(':memory:');
  const store = new ReadingStore(db);
  const options = parseOptions(raw);
  if (seed) seedMockData(store, options);
  let runs = 0;
  const app = buildApp({
    version: '0.0.0-test',
    mock: true,
    options,
    db,
    store,
    haStatus: () => ({ state: 'mock', haVersion: null, timeZone: 'UTC', connectedSince: null, lastError: null }),
    timeZone: () => 'UTC',
    backfill: {
      status: () => ({ state: 'idle', step: null, stored: 0, startedAt: null, finishedAt: null, error: null }),
      run: async () => void runs++,
    },
    onChange: () => () => {},
  });
  return { app, runs: () => runs };
}

describe('GET /api/status', () => {
  it('asks for setup when no odometer is configured', async () => {
    const res = await make({}).app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().setupNeeded).toBe(true);
  });

  it('reports configured sensors and reading counts', async () => {
    const res = await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/status' });
    const body = res.json();
    expect(body.setupNeeded).toBe(false);
    expect(body.sensors.find((s: { key: string }) => s.key === 'odometer').configured).toBe(true);
    expect(body.db.schemaVersion).toBeGreaterThan(1);
    expect(body.db.readings.odometer).toBeGreaterThan(100);
  });
});

describe('GET /api/cockpit', () => {
  it('returns the cockpit for mock data', async () => {
    const body = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/cockpit' })).json();
    expect(body.cockpit.odometer).toBeGreaterThan(8_250);
    expect(body.cockpit.level.level).toBeGreaterThan(10);
    expect(body.soc.value).toBeGreaterThanOrEqual(0);
    expect(body.range).not.toBeNull();
  });

  it('hides SoC and range when those sensors are not configured', async () => {
    const body = (await make({ odometer_entity: 'sensor.my_ev_odometer' }, true).app.inject({ url: '/api/cockpit' })).json();
    expect(body.soc).toBeNull();
    expect(body.range).toBeNull();
    expect(body.cockpit).not.toBeNull();
  });
});

describe('GET /api/history', () => {
  it('returns chart series, records and the timeline for mock data', async () => {
    const body = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/history' })).json();
    const h = body.history;
    expect(h.daily.length).toBeGreaterThan(100);
    expect(h.monthly.length).toBeGreaterThanOrEqual(4);
    expect(h.records.bestDay.km).toBeGreaterThan(0);
    expect(h.records.longestTrip.km).toBeGreaterThan(0);
    expect(h.recentTrips.length).toBe(20);
    expect(h.timeline.initial.length).toBeGreaterThan(0);
  });

  it('asks for setup without an odometer', async () => {
    const body = (await make({}).app.inject({ url: '/api/history' })).json();
    expect(body.setupNeeded).toBe(true);
    expect(body.history).toBeNull();
  });
});

describe('GET /api/charging', () => {
  it('returns sessions, totals, consumption and records for mock data', async () => {
    const body = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/charging' })).json();
    expect(body.available).toBe(true);
    const p = body.period;
    expect(p.sessions.length).toBeGreaterThan(10);
    // Newest first
    expect(p.sessions[0].start).toBeGreaterThan(p.sessions.at(-1).start);
    expect(new Set(p.sessions.map((s: { type: string }) => s.type))).toEqual(new Set(['AC', 'DC']));
    expect(p.sessions.every((s: { kwh: number | null }) => s.kwh === null || s.kwh > 0)).toBe(true);
    expect(p.totals.sessions).toBe(p.sessions.length);
    expect(p.consumption.kwhPer100km).toBeGreaterThan(10);
    expect(p.consumption.kwhPer100km).toBeLessThan(30);
    expect(body.records.fastest.avgKw).toBeGreaterThan(30);
    // The generated 3.7 kW blips (no SoC rise) must not show up as sessions.
    expect(p.sessions.every((s: { kwhMethod: string }) => s.kwhMethod === 'soc')).toBe(true);
    expect(p.sessions.every((s: { socEnd: number; socStart: number }) => s.socEnd - s.socStart >= 2)).toBe(true);
  });

  it('is unavailable without charging sensors', async () => {
    const body = (await make({ odometer_entity: 'sensor.my_ev_odometer' }).app.inject({ url: '/api/charging' })).json();
    expect(body.available).toBe(false);
    expect(body.period).toBeNull();
  });

  it('adds charging records to the history', async () => {
    const body = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/history' })).json();
    expect(body.chargingRecords.busiestMonth.sessions).toBeGreaterThan(0);
  });
});

describe('badges and reveal', () => {
  it('lists badges per category with a counter, without charging badges if not configured', async () => {
    const all = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/badges' })).json();
    expect(all.categories.map((c: { id: string }) => c.id)).toEqual(['rijden', 'laden', 'zuinigheid', 'groen', 'uitdagingen', 'wereldreis', 'legendarisch']);
    const moon = all.categories.at(-1).badges[0];
    expect(moon).toMatchObject({ id: 'moon_trip', name: 'Maanreis', xp: 5000, unlockedTs: null, followable: true });
    expect(moon.progress.target).toBe(384_400);
    expect(all.unlocked).toBeGreaterThan(5);
    expect(all.total).toBeGreaterThan(all.unlocked);
    // A locked hidden badge does not reveal its name.
    const rest = all.categories[0].badges.find((b: { id: string }) => b.id === 'rest_day');
    if (rest.unlockedTs === null) expect(rest.name).toBeNull();

    const odoOnly = (await make({ odometer_entity: 'sensor.my_ev_odometer' }, true).app.inject({ url: '/api/badges' })).json();
    // Without charging or temperature sensors: no charging, CO₂ or temperature badges.
    expect(odoOnly.categories.map((c: { id: string }) => c.id)).toEqual(['rijden', 'groen', 'uitdagingen', 'wereldreis', 'legendarisch']);
    const odoIds = odoOnly.categories.flatMap((c: { badges: { id: string }[] }) => c.badges.map((b) => b.id));
    expect(odoIds).toContain('never_refuel');
    expect(odoIds).not.toContain('green_start');
    expect(odoIds).not.toContain('ice_cold');
  });

  it('adds badge XP to the cockpit level', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const badges = (await app.inject({ url: '/api/badges' })).json();
    const cockpit = (await app.inject({ url: '/api/cockpit' })).json().cockpit;
    expect(cockpit.bonusXp).toBe(badges.bonusXp);
    expect(cockpit.level.xp).toBe(Math.floor(cockpit.odometer + badges.bonusXp));
    expect(cockpit.lastUnlocked).not.toBeNull();
  });

  it('reveals everything already reached once, then nothing after marking it seen', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const first = (await app.inject({ url: '/api/reveal' })).json().items;
    const kinds = new Set(first.map((i: { kind: string }) => i.kind));
    expect(kinds.has('badge')).toBe(true);
    expect(kinds.has('milestone')).toBe(true);
    // Level-ups are combined into one item; existing records are revealed too.
    expect(first.filter((i: { kind: string }) => i.kind === 'level')).toHaveLength(1);
    expect(kinds.has('record')).toBe(true);

    const keys = first.flatMap((i: { keys: string[] }) => i.keys);
    const res = await app.inject({ method: 'POST', url: '/api/seen', payload: { keys } });
    expect(res.json().marked).toBe(keys.length);
    expect((await app.inject({ url: '/api/reveal' })).json().items).toEqual([]);
    const badges = (await app.inject({ url: '/api/badges' })).json();
    expect(badges.categories.flatMap((c: { badges: { isNew: boolean }[] }) => c.badges).some((b: { isNew: boolean }) => b.isNew)).toBe(false);
  });

  it('rejects invalid seen keys', async () => {
    const res = await make({}).app.inject({ method: 'POST', url: '/api/seen', payload: { keys: [1, 2] } });
    expect(res.statusCode).toBe(400);
  });
});

describe('year overview', () => {
  it('lists the years with data and allows a preview of the current year', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const years = (await app.inject({ url: '/api/years' })).json();
    const current = years.years.find((y: { year: number }) => y.year === years.currentYear);
    expect(current.running).toBe(true);

    const preview = await app.inject({ url: `/api/year/${years.currentYear}?preview=1` });
    expect(preview.statusCode).toBe(200);
    const review = preview.json().review;
    expect(review.totalKm).toBeGreaterThan(1000);
    expect(review.charging.sessions).toBeGreaterThan(0);
    expect(review.level.end).toBeGreaterThanOrEqual(review.level.start);

    // Without preview, the current year is only available from 1 December.
    const normal = await app.inject({ url: `/api/year/${years.currentYear}` });
    expect(normal.statusCode).toBe(current.available ? 200 : 403);
  });

  it('returns 404 for a year without data and 400 for nonsense', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    expect((await app.inject({ url: '/api/year/1999?preview=1' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/year/abc' })).statusCode).toBe(400);
  });
});

describe('weekly challenges, green and temperature', () => {
  it('creates a challenge for the current week and shows it on the cockpit', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const c = (await app.inject({ url: '/api/cockpit' })).json().challenge;
    expect(['km', 'days', 'max_charges', 'consumption']).toContain(c.type);
    expect(c.status).toBe('active');
    expect(c.daysLeft).toBeGreaterThanOrEqual(1);
    expect(c.daysLeft).toBeLessThanOrEqual(7);
    expect(c.xp).toBe(100);
    const history = (await app.inject({ url: '/api/history' })).json();
    expect(history.challenges[0].week).toBe(c.week);
  });

  it('keeps one challenge per week and never offers charging challenges without charging sensors', async () => {
    const { app } = make({ odometer_entity: 'sensor.my_ev_odometer' }, true);
    await app.inject({ url: '/api/cockpit' });
    const again = (await app.inject({ url: '/api/history' })).json().challenges;
    expect(again).toHaveLength(1);
    expect(['km', 'days']).toContain(again[0].type);
  });

  it('reports green totals, monthly consumption with temperature, and trip start temperatures', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const charging = (await app.inject({ url: '/api/charging' })).json();
    expect(charging.period.mode).toBe('all');
    expect(charging.period.bucket).toBe('month');
    expect(charging.period.buckets.some((w: { ac: number; dc: number }) => w.ac + w.dc > 0)).toBe(true);
    const soc = (await app.inject({ url: '/api/charging/soc?range=7d' })).json();
    expect(soc.soc.length).toBeGreaterThan(5);
    expect(soc.soc.every(([, v]: [number, number]) => v >= 0 && v <= 100)).toBe(true);
    expect(charging.green.co2Kg).toBeGreaterThan(0);
    expect(charging.green.liters).toBeGreaterThan(0);
    const history = (await app.inject({ url: '/api/history' })).json();
    expect(history.hasTemperature).toBe(true);
    expect(history.monthly.some((m: { avgTemp: number | null }) => m.avgTemp !== null)).toBe(true);
    expect(history.history.recentTrips.some((t: { startTemp: number | null }) => t.startTemp !== null)).toBe(true);
  });

  it('serves the charging screen per period and remembers the choice', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const all = (await app.inject({ url: '/api/charging' })).json().period;
    const month = (await app.inject({ url: '/api/charging?period=month' })).json().period;
    expect(month.bucket).toBe('day');
    expect(month.buckets.length).toBeGreaterThanOrEqual(28);
    expect(month.next).toBeNull();
    expect(month.prev).not.toBeNull();
    expect(month.totals.sessions).toBeLessThanOrEqual(all.totals.sessions);
    const prev = (await app.inject({ url: `/api/charging?period=month&key=${month.prev}` })).json().period;
    expect(prev.key).toBe(month.prev);
    expect(prev.next).toBe(month.key);
    const week = (await app.inject({ url: '/api/charging?period=week' })).json().period;
    expect(week.buckets).toHaveLength(7);
    expect(week.label).toMatch(/^week \d+, \d{4}$/);
    const year = (await app.inject({ url: '/api/charging?period=year&key=1999' })).json().period;
    expect(year.buckets).toHaveLength(12);
    expect(year.key >= '2000').toBe(true);
    expect((await app.inject({ url: '/api/charging?period=day' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/charging/soc?range=1y' })).statusCode).toBe(400);
    const day = (await app.inject({ url: '/api/charging/soc?range=24h' })).json();
    const month30 = (await app.inject({ url: '/api/charging/soc?range=30d' })).json();
    expect(month30.soc.length).toBeGreaterThan(day.soc.length);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { chargingPeriod: 'year' } });
    expect((await app.inject({ url: '/api/charging' })).json().period.mode).toBe('year');
    expect((await app.inject({ method: 'PUT', url: '/api/settings', payload: { chargingPeriod: 'day' } })).statusCode).toBe(400);
  });

  it('puts the weekly review first in the reveal once a full week lies behind', async () => {
    const items = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/reveal' })).json().items;
    expect(items[0].kind).toBe('week');
    expect(items[0].name).toBe('Vorige week');
    expect(items[0].stats[0].label).toBe('Gereden');
  });
});

describe('followed badge', () => {
  it('picks one automatically, follows a chosen badge, and rejects unfollowable ones', async () => {
    const { app } = make(MOCK_OPTIONS_RAW, true);
    const auto = (await app.inject({ url: '/api/cockpit' })).json().followed;
    expect(auto.auto).toBe(true);
    expect(auto.remaining).toBe(auto.target - auto.current);

    const put = await app.inject({ method: 'PUT', url: '/api/settings', payload: { followedBadge: 'moon_trip' } });
    expect(put.json().followedBadge).toBe('moon_trip');
    const chosen = (await app.inject({ url: '/api/cockpit' })).json().followed;
    expect(chosen).toMatchObject({ id: 'moon_trip', name: 'Maanreis', auto: false, target: 384_400, unit: 'km' });
    const badges = (await app.inject({ url: '/api/badges' })).json();
    expect(badges.followedId).toBe('moon_trip');
    expect(badges.followedAuto).toBe(false);

    // No measurable progress (first_100_day) or hidden (rest_day): not followable.
    for (const id of ['first_100_day', 'rest_day', 'does_not_exist']) {
      const bad = await app.inject({ method: 'PUT', url: '/api/settings', payload: { followedBadge: id } });
      expect(bad.statusCode).toBe(400);
    }
    // null clears the choice again.
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { followedBadge: null } });
    expect((await app.inject({ url: '/api/cockpit' })).json().followed.auto).toBe(true);
  });
});

describe('/api/settings', () => {
  it('defaults to the automatic theme and stores a choice', async () => {
    const { app } = make({});
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ theme: 'auto', navPosition: 'top', followedBadge: null, chargingPeriod: 'all' });
    const put = await app.inject({ method: 'PUT', url: '/api/settings', payload: { theme: 'light' } });
    expect(put.json()).toEqual({ theme: 'light', navPosition: 'top', followedBadge: null, chargingPeriod: 'all' });
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ theme: 'light', navPosition: 'top', followedBadge: null, chargingPeriod: 'all' });
  });

  it('stores the navigation position (default top) and rejects unknown values', async () => {
    const { app } = make({});
    const put = await app.inject({ method: 'PUT', url: '/api/settings', payload: { navPosition: 'auto' } });
    expect(put.json().navPosition).toBe('auto');
    expect((await app.inject({ url: '/api/settings' })).json().navPosition).toBe('auto');
    const bad = await app.inject({ method: 'PUT', url: '/api/settings', payload: { navPosition: 'left' } });
    expect(bad.statusCode).toBe(400);
  });

  it('rejects an unknown theme', async () => {
    const res = await make({}).app.inject({ method: 'PUT', url: '/api/settings', payload: { theme: 'pink' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/backfill and GET /api/export', () => {
  it('starts a backfill', async () => {
    const m = make(MOCK_OPTIONS_RAW);
    const res = await m.app.inject({ method: 'POST', url: '/api/backfill' });
    expect(res.statusCode).toBe(202);
    expect(m.runs()).toBe(1);
  });

  it('exports all readings as a JSON download', async () => {
    const res = await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/export' });
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const body = res.json();
    expect(body.app).toBe('q4-quest');
    expect(body.readings.length).toBeGreaterThan(1000);
  });
});

describe('HA client helpers', () => {
  it('builds WebSocket URLs', () => {
    expect(toWebSocketUrl('http://example.invalid:8123')).toBe('ws://example.invalid:8123/api/websocket');
    expect(toWebSocketUrl('https://example.invalid/')).toBe('wss://example.invalid/api/websocket');
  });

  it('backs off exponentially with a cap', () => {
    expect(backoffDelay(0)).toBe(5_000);
    expect(backoffDelay(1)).toBe(10_000);
    expect(backoffDelay(20)).toBe(300_000);
  });
});

describe('versions', () => {
  it('package.json and config.yaml have the same version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const yaml = readFileSync(new URL('../../config.yaml', import.meta.url), 'utf8');
    expect(yaml).toMatch(new RegExp(`^version: "${pkg.version.replace(/\./g, '\\.')}"$`, 'm'));
  });
});
