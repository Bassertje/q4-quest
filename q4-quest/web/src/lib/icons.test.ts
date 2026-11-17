import { describe, expect, it } from 'vitest';
import { BADGES, worldTripBadges } from '../../../game/src/badges.ts';
import { eventInstance, WINTERRIT, winterritBadges } from '../../../game/src/events.ts';
import { ICONS, pixelPath, pixelRuns } from './icons.ts';

describe('pixel icons', () => {
  it('are all 16×16 and use only known tones', () => {
    for (const [name, grid] of Object.entries(ICONS)) {
      expect(grid, name).toHaveLength(16);
      for (const row of grid) expect(row, name).toMatch(/^[.#+-]{16}$/);
    }
  });

  it('exist for every badge, milestone and reveal item', () => {
    const winter = winterritBadges(eventInstance(WINTERRIT, 2026, 'UTC'));
    const needed = [...BADGES, ...worldTripBadges(), ...winter].map((b) => b.icon).concat(['levelUp', 'crown', 'calendar7', 'star']);
    for (const icon of needed) expect(ICONS[icon], icon).toBeDefined();
  });

  it('merges runs of the same tone', () => {
    expect(pixelRuns(['.##+', '....'])).toEqual([
      { x: 1, y: 0, w: 2, tone: '#' },
      { x: 3, y: 0, w: 1, tone: '+' },
    ]);
    expect(pixelPath(['##'])).toBe('M0 0h2v1h-2z');
  });
});
