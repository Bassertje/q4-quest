import { buildYearReview, dayKey, yearsWithReview, type YearAvailability, type YearReview } from '../../game/src/index.ts';
import { chargingAvailable } from './charging.ts';
import type { GameState } from './game-state.ts';
import type { Options } from './options.ts';

export interface YearsResponse {
  setupNeeded: boolean;
  timeZone: string;
  currentYear: number;
  today: string;
  years: YearAvailability[];
}

export function yearsResponse(state: GameState): YearsResponse {
  const today = dayKey(state.now, state.timeZone);
  const firstDay = state.odometer[0] ? dayKey(state.odometer[0].ts, state.timeZone) : null;
  return {
    setupNeeded: state.setupNeeded,
    timeZone: state.timeZone,
    currentYear: Number(today.slice(0, 4)),
    today,
    years: yearsWithReview(firstDay, today),
  };
}

export type YearResult =
  | { status: 200; body: { timeZone: string; preview: boolean; review: YearReview } }
  | { status: 403 | 404; body: { error: string } };

/**
 * The overview of one year. The current year is only available from
 * 1 December, unless `preview` is set (the "Voorbeeld" button in settings).
 */
export function yearResponse(state: GameState, options: Options, year: number, preview: boolean): YearResult {
  const availability = yearsResponse(state).years.find((y) => y.year === year);
  if (!availability) return { status: 404, body: { error: 'no data for this year' } };
  if (!availability.available && !preview) return { status: 403, body: { error: 'available from 1 December' } };
  const review = buildYearReview({
    year,
    odometer: state.odometer,
    dailyTotals: state.dailyTotals,
    sessions: chargingAvailable(options) ? state.sessions.filter((s) => !s.ongoing) : null,
    badges: state.badges,
    timeZone: state.timeZone,
    now: state.now,
  });
  if (!review) return { status: 404, body: { error: 'no data for this year' } };
  return { status: 200, body: { timeZone: state.timeZone, preview: !availability.available, review } };
}
