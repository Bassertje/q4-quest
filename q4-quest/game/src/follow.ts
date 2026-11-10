import type { BadgeResult } from './badges.ts';

/** Only badges with measurable progress that are not hidden can be followed. */
export function isFollowable(b: BadgeResult): boolean {
  return b.progress !== null && !b.hidden;
}

export interface FollowedBadge {
  badge: BadgeResult;
  /** Chosen automatically (no choice, or the chosen badge was already earned). */
  auto: boolean;
  remaining: number;
}

/**
 * The badge shown on the cockpit: the user's choice if it is followable and
 * not yet earned; otherwise the not-yet-earned followable badge with the
 * highest progress percentage (ties: least remaining).
 */
export function pickFollowedBadge(badges: BadgeResult[], preferredId: string | null): FollowedBadge | null {
  const open = badges.filter((b) => isFollowable(b) && b.unlockedTs === null);
  const result = (badge: BadgeResult, auto: boolean): FollowedBadge => ({
    badge,
    auto,
    remaining: Math.max(0, badge.progress!.target - badge.progress!.current),
  });
  const preferred = preferredId ? open.find((b) => b.id === preferredId) : undefined;
  if (preferred) return result(preferred, false);
  const ratio = (b: BadgeResult) => b.progress!.current / b.progress!.target;
  const best = open.reduce<BadgeResult | null>((top, b) => {
    if (!top) return b;
    const d = ratio(b) - ratio(top);
    if (d > 1e-12) return b;
    if (Math.abs(d) <= 1e-12 && b.progress!.target - b.progress!.current < top.progress!.target - top.progress!.current) return b;
    return top;
  }, null);
  return best ? result(best, true) : null;
}
