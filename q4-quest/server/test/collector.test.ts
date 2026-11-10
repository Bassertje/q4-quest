import { describe, expect, it } from 'vitest';
import { Collector } from '../src/collector/collector.ts';
import { applyEntitiesEvent } from '../src/collector/compressed.ts';
import { openDatabase } from '../src/db.ts';
import type { HaClient } from '../src/ha/client.ts';
import { parseOptions } from '../src/options.ts';
import { ReadingStore } from '../src/readings.ts';

const ODO = 'sensor.my_ev_odometer';
const SOC = 'sensor.my_ev_battery_level';
const s = (ms: number) => ms / 1000;

describe('applyEntitiesEvent', () => {
  it('handles full states, diffs and attribute-only changes', () => {
    const cache = new Map();
    const first = applyEntitiesEvent(cache, { a: { [ODO]: { s: '100', a: { unit_of_measurement: 'km' }, lc: 10 } } }, 0);
    expect(first).toEqual([{ entityId: ODO, state: '100', attrs: { unit_of_measurement: 'km' }, ts: 10_000 }]);

    const second = applyEntitiesEvent(cache, { c: { [ODO]: { '+': { s: '105', lc: 20 } } } }, 0);
    expect(second).toEqual([{ entityId: ODO, state: '105', attrs: { unit_of_measurement: 'km' }, ts: 20_000 }]);

    const attrOnly = applyEntitiesEvent(cache, { c: { [ODO]: { '+': { a: { icon: 'x' }, lu: 30 } } } }, 0);
    expect(attrOnly).toEqual([]);
    expect(cache.get(ODO).attrs).toEqual({ unit_of_measurement: 'km', icon: 'x' });
  });
});

/** A fake HA client that answers commands from canned data. */
function fakeClient(handlers: Record<string, (msg: Record<string, any>) => unknown>) {
  const connect: (() => void)[] = [];
  const subs: ((e: unknown) => void)[] = [];
  const calls: Record<string, any>[] = [];
  const client = {
    status: { state: 'connected', timeZone: 'UTC', haVersion: null, connectedSince: null, lastError: null },
    onConnect: (h: () => void) => connect.push(h),
    subscribe: async (_type: string, _p: unknown, h: (e: unknown) => void) => void subs.push(h),
    call: async (type: string, payload: Record<string, unknown>) => {
      calls.push({ type, ...payload });
      return handlers[type]?.({ type, ...payload }) ?? {};
    },
  };
  return {
    client: client as unknown as HaClient,
    connect: () => connect.forEach((h) => h()),
    push: (e: unknown) => subs.forEach((h) => h(e)),
    calls,
  };
}

function setup(handlers: Record<string, (msg: Record<string, any>) => unknown>) {
  const db = openDatabase(':memory:');
  const store = new ReadingStore(db);
  const fake = fakeClient(handlers);
  const collector = new Collector(fake.client, store, db, parseOptions({ odometer_entity: ODO, soc_entity: SOC }));
  collector.start();
  return { db, store, fake, collector };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('Collector', () => {
  const now = Date.now();
  const hour = 3_600_000;

  it('backfills statistics and history once, then stores live states', async () => {
    const { store, fake, collector } = setup({
      'recorder/statistics_during_period': (m) =>
        m.period === 'month'
          ? { [ODO]: [{ start: now - 3 * hour, end: now }] }
          : { [ODO]: [{ start: now - 3 * hour, end: now - 2 * hour, max: 1_000 }] },
      'history/history_during_period': (m) =>
        Date.parse(m.end_time) > now - 2 * 86_400_000
          ? {
              [ODO]: [{ s: '1010', a: { unit_of_measurement: 'km' }, lu: s(now - hour) }],
              [SOC]: [{ s: 'unavailable', lu: s(now - hour) }, { s: '55', lu: s(now - hour + 1000) }],
            }
          : {},
    });
    fake.connect();
    await settle();

    expect(collector.backfill.state).toBe('done');
    expect(store.series('odometer').map((r) => r.value)).toEqual([1_000, 1_010]);
    expect(store.latest('soc')?.value).toBe('55');

    // Live: a new odometer value, then a lower (invalid) one.
    fake.push({ c: { [ODO]: { '+': { s: '1012', lc: s(now) } } } });
    fake.push({ c: { [ODO]: { '+': { s: '900', lc: s(now + 1000) } } } });
    expect(store.series('odometer').map((r) => r.value)).toEqual([1_000, 1_010, 1_012]);

    // A reconnect does not run the backfill again, but fills the gap.
    const before = fake.calls.filter((c) => c.type === 'recorder/statistics_during_period').length;
    fake.connect();
    await settle();
    expect(fake.calls.filter((c) => c.type === 'recorder/statistics_during_period').length).toBe(before);
    const gapCall = fake.calls.at(-1)!;
    expect(gapCall.type).toBe('history/history_during_period');
    expect(Date.parse(gapCall.start_time)).toBe(now);
  });

  it('never calls services (read-only)', async () => {
    const { fake } = setup({});
    fake.connect();
    await settle();
    expect(fake.calls.some((c) => String(c.type).includes('call_service'))).toBe(false);
  });
});
