import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { toWebSocketUrl, backoffDelay } from '../src/ha/client.ts';
import { parseOptions } from '../src/options.ts';

describe('GET /api/status', () => {
  const make = (raw: unknown) =>
    buildApp({
      version: '0.0.0-test',
      mock: true,
      options: parseOptions(raw),
      db: openDatabase(':memory:'),
      haStatus: () => ({ state: 'mock', haVersion: null, timeZone: 'UTC', connectedSince: null, lastError: null }),
    });

  it('asks for setup when no odometer is configured', async () => {
    const res = await make({}).inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().setupNeeded).toBe(true);
  });

  it('reports configured sensors', async () => {
    const res = await make({ odometer_entity: 'sensor.my_ev_odometer' }).inject({ url: '/api/status' });
    const body = res.json();
    expect(body.setupNeeded).toBe(false);
    expect(body.sensors.find((s: { key: string }) => s.key === 'odometer').configured).toBe(true);
    expect(body.db.schemaVersion).toBeGreaterThan(0);
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
