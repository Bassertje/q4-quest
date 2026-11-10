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
    expect(body.sessions.length).toBeGreaterThan(10);
    // Newest first
    expect(body.sessions[0].start).toBeGreaterThan(body.sessions.at(-1).start);
    expect(new Set(body.sessions.map((s: { type: string }) => s.type))).toEqual(new Set(['AC', 'DC']));
    expect(body.sessions.every((s: { kwh: number | null }) => s.kwh === null || s.kwh > 0)).toBe(true);
    expect(body.totals.sessions).toBe(body.sessions.length);
    expect(body.consumption.kwhPer100km).toBeGreaterThan(10);
    expect(body.consumption.kwhPer100km).toBeLessThan(30);
    expect(body.records.fastest.avgKw).toBeGreaterThan(30);
    // The generated 3.7 kW blips (no SoC rise) must not show up as sessions.
    expect(body.sessions.every((s: { kwhMethod: string }) => s.kwhMethod === 'soc')).toBe(true);
    expect(body.sessions.every((s: { socEnd: number; socStart: number }) => s.socEnd - s.socStart >= 2)).toBe(true);
  });

  it('is unavailable without charging sensors', async () => {
    const body = (await make({ odometer_entity: 'sensor.my_ev_odometer' }).app.inject({ url: '/api/charging' })).json();
    expect(body.available).toBe(false);
    expect(body.sessions).toEqual([]);
  });

  it('adds charging records to the history', async () => {
    const body = (await make(MOCK_OPTIONS_RAW, true).app.inject({ url: '/api/history' })).json();
    expect(body.chargingRecords.busiestMonth.sessions).toBeGreaterThan(0);
  });
});

describe('/api/settings', () => {
  it('defaults to the automatic theme and stores a choice', async () => {
    const { app } = make({});
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ theme: 'auto' });
    const put = await app.inject({ method: 'PUT', url: '/api/settings', payload: { theme: 'light' } });
    expect(put.json()).toEqual({ theme: 'light' });
    expect((await app.inject({ url: '/api/settings' })).json()).toEqual({ theme: 'light' });
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
