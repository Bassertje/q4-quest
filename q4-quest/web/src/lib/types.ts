export interface Milestone {
  km: number;
  name: string;
}

export interface CockpitData {
  setupNeeded: boolean;
  timeZone: string;
  cockpit: {
    odometer: number;
    odometerTs: number;
    level: { xp: number; level: number; rank: string; levelStartXp: number; nextLevelXp: number; fraction: number };
    milestone: { previous: Milestone | null; next: Milestone; fraction: number; remainingKm: number };
    bonusXp: number;
    lastUnlocked: { id: string; name: string; icon: string; category: string; ts: number } | null;
    distance: { today: number; week: number; month: number };
    streak: number;
  } | null;
  soc: { value: number; ts: number } | null;
  range: { value: number; ts: number } | null;
  followed: {
    id: string;
    name: string;
    icon: string;
    auto: boolean;
    current: number;
    target: number;
    unit: string;
    remaining: number;
  } | null;
}

export interface StatusData {
  version: string;
  mode: 'mock' | 'live';
  setupNeeded: boolean;
  ha: { state: string; haVersion: string | null; timeZone: string | null; lastError: string | null };
  timeZone: string;
  sensors: { key: string; entityId: string | null; configured: boolean }[];
  batteryKwh: number;
  features: { charging: boolean };
  db: { schemaVersion: number; readings: Record<string, number> };
  backfill: {
    state: 'idle' | 'running' | 'done' | 'error';
    step: string | null;
    stored: number;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
}

export type Series = [key: string, km: number][];

export type TimelineEvent =
  | { type: 'milestone'; ts: number; km: number; name: string; xp: number }
  | { type: 'badge'; ts: number; id: string; name: string; xp: number; icon: string }
  | { type: 'level'; ts: number; level: number; rank: string; newRank: boolean };

export interface TripBlock {
  start: number;
  end: number;
  km: number;
  readings: number;
}

export interface ChargingSession {
  start: number;
  end: number;
  ongoing: boolean;
  type: 'AC' | 'DC';
  socStart: number | null;
  socEnd: number | null;
  kwh: number | null;
  kwhMethod: 'soc' | 'power' | null;
  avgKw: number | null;
}

export interface ChargingRecords {
  fastest: ChargingSession | null;
  busiestMonth: { key: string; sessions: number } | null;
}

export interface ChargingData {
  available: boolean;
  timeZone: string;
  batteryKwh: number;
  sessions: ChargingSession[];
  totals: {
    sessions: number;
    kwh: number;
    ac: { sessions: number; kwh: number };
    dc: { sessions: number; kwh: number };
  } | null;
  consumption: { kwhPer100km: number | null; km: number; kwh: number; sessions: number } | null;
  records: ChargingRecords | null;
}

export interface HistoryData {
  setupNeeded: boolean;
  timeZone: string;
  history: {
    daily: Series;
    weekly: Series;
    monthly: Series;
    records: {
      bestDay: { key: string; km: number } | null;
      bestWeek: { key: string; km: number } | null;
      bestMonth: { key: string; km: number } | null;
      longestStreak: { days: number; start: string; end: string } | null;
      longestTrip: TripBlock | null;
    };
    recentTrips: TripBlock[];
    timeline: { initial: TimelineEvent[]; events: TimelineEvent[] };
  } | null;
  chargingRecords: ChargingRecords | null;
}

export interface BadgeView {
  id: string;
  name: string | null;
  description: string | null;
  hint: string;
  xp: number;
  hidden: boolean;
  icon: string;
  unlockedTs: number | null;
  isNew: boolean;
  progress: { current: number; target: number; unit: string } | null;
  followable: boolean;
}

export interface BadgesData {
  followedId: string | null;
  followedAuto: boolean;
  setupNeeded: boolean;
  timeZone: string;
  unlocked: number;
  total: number;
  bonusXp: number;
  categories: { id: string; name: string; badges: BadgeView[] }[];
}

export interface RevealItem {
  keys: string[];
  kind: 'badge' | 'milestone' | 'level' | 'rank' | 'record';
  name: string;
  description: string;
  icon: string;
  ts: number;
  xp: number;
}

export interface YearsData {
  setupNeeded: boolean;
  timeZone: string;
  currentYear: number;
  today: string;
  years: { year: number; available: boolean; running: boolean }[];
}

export interface YearReview {
  year: number;
  from: string;
  to: string;
  startedThisYear: boolean;
  running: boolean;
  totalKm: number;
  daysDriven: number;
  bestDay: { key: string; km: number } | null;
  bestWeek: { key: string; km: number } | null;
  longestStreak: { days: number; start: string; end: string } | null;
  charging: {
    sessions: number;
    kwh: number;
    ac: { sessions: number; kwh: number };
    dc: { sessions: number; kwh: number };
  } | null;
  newBadges: { id: string; name: string; icon: string; category: string; xp: number; ts: number }[];
  level: { start: number; end: number; startRank: string; endRank: string; xpGained: number };
  earth: { km: number; laps: number };
}

export interface YearData {
  timeZone: string;
  preview: boolean;
  review: YearReview;
}
