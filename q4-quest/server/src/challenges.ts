import type { DatabaseSync } from 'node:sqlite';
import {
  CHALLENGE_XP,
  challengeTarget,
  chooseChallengeType,
  dayKey,
  describeChallenge,
  evaluateChallenge,
  historyWeeks,
  shiftPeriod,
  weekBounds,
  weekKey,
  type BadgeResult,
  type ChallengeContext,
  type ChallengeResult,
  type ChallengeType,
} from '../../game/src/index.ts';

interface Row {
  week: string;
  type: ChallengeType;
  target: number;
  status: ChallengeResult['status'];
  current: number | null;
  completed_ts: number | null;
}

const toResult = (r: Row): ChallengeResult => ({
  week: r.week,
  type: r.type,
  target: r.target,
  status: r.status,
  current: r.current,
  completedTs: r.completed_ts,
});

export function listChallenges(db: DatabaseSync): ChallengeResult[] {
  return (db.prepare('SELECT * FROM challenges ORDER BY week').all() as unknown as Row[]).map(toResult);
}

/** Which challenge types are possible with the configured sensors. */
export function availableTypes(charging: boolean): ChallengeType[] {
  return charging ? ['km', 'days', 'max_charges', 'consumption'] : ['km', 'days'];
}

/**
 * Make sure the week of `now` has a challenge (chosen as on Monday 00:00 from
 * the data before that week), and update every challenge that is not final
 * yet. Results are stored, so the history stays visible.
 */
export function syncChallenges(
  db: DatabaseSync,
  ctx: ChallengeContext & { firstTs: number | null; charging: boolean },
): ChallengeResult[] {
  if (ctx.firstTs === null) return listChallenges(db);
  const week = weekKey(dayKey(ctx.now, ctx.timeZone));
  const existing = db.prepare('SELECT week FROM challenges WHERE week = ?').get(week);
  if (!existing) {
    const { start } = weekBounds(week, ctx.timeZone);
    const before = ctx.sessions.filter((s) => s.end < start);
    const firstDay = dayKey(ctx.firstTs, ctx.timeZone);
    const previous = db.prepare('SELECT type FROM challenges WHERE week = ?').get(shiftPeriod('week', week, -1)) as
      | { type: ChallengeType }
      | undefined;
    const type = chooseChallengeType(week, availableTypes(ctx.charging), previous?.type ?? null);
    const target = challengeTarget(type, historyWeeks(week, firstDay, ctx.dailyTotals, before, ctx.timeZone));
    db.prepare(
      'INSERT INTO challenges (week, type, target, status, current, completed_ts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(week, type, target, 'active', null, null, new Date(ctx.now).toISOString());
  }

  const update = db.prepare('UPDATE challenges SET status = ?, current = ?, completed_ts = ? WHERE week = ?');
  for (const ch of listChallenges(db)) {
    if (ch.status !== 'active') continue; // done and missed are final
    const r = evaluateChallenge(ch, ctx);
    update.run(r.status, r.current, r.completedTs, r.week);
  }
  return listChallenges(db);
}

/** Completed challenges as internal "badges" so their 100 XP counts everywhere. */
export function challengeBonusBadges(challenges: ChallengeResult[]): BadgeResult[] {
  return challenges
    .filter((c) => c.status === 'done' && c.completedTs !== null)
    .map((c) => {
      const d = describeChallenge(c.type, c.target);
      return {
        id: `challenge_${c.week}`,
        name: `Weekuitdaging: ${d.title}`,
        description: d.goal,
        hint: d.goal,
        category: 'weekuitdaging',
        xp: CHALLENGE_XP,
        hidden: true,
        icon: 'target',
        unlockedTs: c.completedTs,
        progress: null,
      };
    });
}
