export interface TimedValue {
  ts: number;
  value: number;
}

export const EARTH_KM = 40_075;
export const MOON_KM = 384_400;

/** A destination of the world trip: reached when the odometer passes `km`. */
export interface Destination {
  km: number;
  /** Badge id. The 1,000 km and earth badges keep their original ids. */
  id: string;
  name: string;
  /** One sentence, shown with the badge and in the reveal. */
  story: string;
  icon: string;
}

/** The world trip, in order of distance. */
export const WORLD_TRIP: Destination[] = [
  { km: 100, id: 'karman', name: 'Kármánlijn', story: 'Recht omhoog was je nu in de ruimte.', icon: 'rocket' },
  { km: 408, id: 'iss', name: 'Aanmeren bij het ISS', story: 'Zo hoog cirkelt het ruimtestation boven ons.', icon: 'station' },
  { km: 1_000, id: 'milestone_1000', name: '1.000 km', story: 'Je eerste duizend kilometer.', icon: 'flag' },
  { km: 1_650, id: 'rome', name: 'Alle wegen leiden naar Rome', story: 'Net zo ver als van Amsterdam naar Rome over de weg.', icon: 'column' },
  { km: 3_940, id: 'route66', name: 'Route 66', story: 'Chicago naar Santa Monica, van begin tot eind.', icon: 'sign66' },
  { km: 5_860, id: 'atlantic', name: 'Over de plas', story: 'Hemelsbreed van Amsterdam naar New York.', icon: 'waves' },
  { km: 9_289, id: 'transsib', name: 'Trans-Siberië Express', story: 'Moskou naar Vladivostok, de langste treinreis ter wereld.', icon: 'train' },
  { km: 16_600, id: 'downunder', name: 'Down Under', story: 'Hemelsbreed van Amsterdam naar Sydney.', icon: 'kangaroo' },
  { km: 21_196, id: 'greatwall', name: 'De Chinese Muur', story: 'Alle delen van de muur achter elkaar gelegd.', icon: 'wall' },
  { km: 30_000, id: 'panam', name: 'Pan-Americana', story: 'Van Alaska tot Vuurland.', icon: 'mountains' },
  { km: EARTH_KM, id: 'milestone_40075', name: 'Rondje aarde', story: 'Eén keer rond de evenaar.', icon: 'earth' },
];

/** Bonus XP of a world-trip badge: its distance in km ÷ 10, rounded down. */
export function destinationXp(km: number): number {
  return Math.floor(km / 10);
}

export interface DestinationProgress {
  previous: Destination | null;
  /** The next destination, or null when the whole world trip is done. */
  next: Destination | null;
  /** 0..1 progress from the previous destination (or 0 km) to the next. */
  fraction: number;
  remainingKm: number;
}

/** Progress towards the next destination of the world trip. */
export function destinationProgress(odometer: number): DestinationProgress {
  const reached = WORLD_TRIP.filter((d) => d.km <= odometer);
  const previous = reached.at(-1) ?? null;
  const next = WORLD_TRIP[reached.length] ?? null;
  if (!next) return { previous, next: null, fraction: 1, remainingKm: 0 };
  const from = previous?.km ?? 0;
  return {
    previous,
    next,
    fraction: Math.min(1, Math.max(0, (odometer - from) / (next.km - from))),
    remainingKm: Math.max(0, next.km - odometer),
  };
}

/**
 * When each destination was first reached: the first reading at or above it.
 * Destinations already passed before the first reading get that first timestamp.
 */
export function destinationDates(series: TimedValue[]): { destination: Destination; ts: number }[] {
  const out: { destination: Destination; ts: number }[] = [];
  let index = 0;
  for (const r of series) {
    while (index < WORLD_TRIP.length && WORLD_TRIP[index].km <= r.value) {
      out.push({ destination: WORLD_TRIP[index], ts: r.ts });
      index++;
    }
  }
  return out;
}
