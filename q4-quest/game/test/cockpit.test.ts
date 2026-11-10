import { describe, expect, it } from 'vitest';
import { buildCockpit } from '../src/cockpit.ts';

describe('buildCockpit', () => {
  it('returns null without odometer data', () => {
    expect(buildCockpit({ odometer: [], now: 0, timeZone: 'UTC' })).toBeNull();
  });

  it('combines level, milestones and distance', () => {
    const c = buildCockpit({
      odometer: [
        { ts: Date.parse('2026-11-09T08:00:00Z'), value: 14_950 },
        { ts: Date.parse('2026-11-10T08:00:00Z'), value: 15_020 },
      ],
      now: Date.parse('2026-11-10T12:00:00Z'),
      timeZone: 'UTC',
    })!;
    expect(c.odometer).toBe(15_020);
    expect(c.level.level).toBe(16);
    expect(c.milestone.next.km).toBe(20_000);
    expect(c.lastMilestone?.milestone.km).toBe(15_000);
    expect(c.distance).toEqual({ today: 70, week: 70, month: 70 });
    expect(c.streak).toBe(1);
  });
});
