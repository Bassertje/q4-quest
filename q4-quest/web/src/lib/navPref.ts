export type NavChoice = 'top' | 'bottom' | 'auto';
export type NavPosition = 'top' | 'bottom';

const CACHE_KEY = 'q4quest.nav';
export const NAV_EVENT = 'q4quest-nav';

export function isNavChoice(v: unknown): v is NavChoice {
  return v === 'top' || v === 'bottom' || v === 'auto';
}

/** "Automatisch": bottom in the Home Assistant Companion app, top elsewhere. */
export function resolveNav(choice: NavChoice, userAgent: string): NavPosition {
  if (choice !== 'auto') return choice;
  return userAgent.includes('Home Assistant/') ? 'bottom' : 'top';
}

/** Locally cached choice, only to avoid a jump on start; the database is the source of truth. */
export function cachedNav(): NavChoice {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    return isNavChoice(v) ? v : 'top';
  } catch {
    return 'top';
  }
}

export function applyNav(choice: NavChoice): void {
  try {
    localStorage.setItem(CACHE_KEY, choice);
  } catch {
    // Storage unavailable: the server value is applied after loading.
  }
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: choice }));
}

export async function saveNav(choice: NavChoice): Promise<void> {
  applyNav(choice);
  await fetch('./api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ navPosition: choice }),
  });
}
