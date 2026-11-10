/** Fixed milestones on the odometer (km). After the last one: every 25,000 km. */
export const FIXED_MILESTONES = [
  1_000, 2_500, 5_000, 7_500, 10_000, 15_000, 20_000, 25_000, 40_075, 50_000, 75_000, 100_000,
];
export const MILESTONE_STEP_AFTER = 25_000;
export const EARTH_KM = 40_075;
export const MOON_KM = 384_400;

export interface Milestone {
  km: number;
  name: string;
}

export function milestoneName(km: number): string {
  if (km === EARTH_KM) return 'Rondje aarde';
  return `${km.toLocaleString('nl-NL')} km`;
}

/** The n-th milestone (0-based), continuing indefinitely after the fixed list. */
export function milestoneAt(index: number): Milestone {
  const last = FIXED_MILESTONES[FIXED_MILESTONES.length - 1];
  const km =
    index < FIXED_MILESTONES.length
      ? FIXED_MILESTONES[index]
      : last + (index - FIXED_MILESTONES.length + 1) * MILESTONE_STEP_AFTER;
  return { km, name: milestoneName(km) };
}

/** All milestones reached at a given odometer value, in order. */
export function milestonesReached(odometer: number): Milestone[] {
  const out: Milestone[] = [];
  for (let i = 0; ; i++) {
    const m = milestoneAt(i);
    if (m.km > odometer) return out;
    out.push(m);
  }
}

export interface MilestoneProgress {
  previous: Milestone | null;
  next: Milestone;
  /** 0..1 progress from the previous milestone (or 0 km) to the next. */
  fraction: number;
  remainingKm: number;
}

export function milestoneProgress(odometer: number): MilestoneProgress {
  const reached = milestonesReached(odometer);
  const previous = reached.at(-1) ?? null;
  const next = milestoneAt(reached.length);
  const from = previous?.km ?? 0;
  return {
    previous,
    next,
    fraction: Math.min(1, Math.max(0, (odometer - from) / (next.km - from))),
    remainingKm: Math.max(0, next.km - odometer),
  };
}

export interface TimedValue {
  ts: number;
  value: number;
}

/**
 * Retroactively determine when each milestone was first reached: the
 * timestamp of the first reading at or above the milestone.
 * Milestones already passed before the first reading get that first timestamp.
 */
export function milestoneDates(series: TimedValue[]): { milestone: Milestone; ts: number }[] {
  const out: { milestone: Milestone; ts: number }[] = [];
  let index = 0;
  for (const r of series) {
    while (milestoneAt(index).km <= r.value) {
      out.push({ milestone: milestoneAt(index), ts: r.ts });
      index++;
    }
  }
  return out;
}
