export interface Destination {
  km: number;
  id: string;
  name: string;
  story: string;
  icon: string;
}

export interface CockpitData {
  setupNeeded: boolean;
  timeZone: string;
  cockpit: {
    odometer: number;
    odometerTs: number;
    level: { xp: number; level: number; rank: string; levelStartXp: number; nextLevelXp: number; fraction: number };
    destination: { previous: Destination | null; next: Destination | null; fraction: number; remainingKm: number };
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
  challenge: {
    week: string;
    type: 'km' | 'days' | 'max_charges' | 'consumption';
    title: string;
    goal: string;
    unit: string;
    target: number;
    current: number | null;
    status: 'active' | 'done' | 'missed';
    daysLeft: number;
    xp: number;
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
  typeSource: 'sensor' | 'derived';
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

export type ChargePeriodMode = 'week' | 'month' | 'year' | 'all';
export type ViewPeriodMode = ChargePeriodMode;

/** The part of a period response the period picker needs. */
export interface PeriodNav {
  mode: ViewPeriodMode;
  key: string;
  label: string;
  prev: string | null;
  next: string | null;
}

export interface HistoryPeriod extends PeriodNav {
  fromDay: string;
  toDay: string;
  dataFrom: string | null;
  dataTo: string | null;
  bucket: 'day' | 'month';
  /** With "all", a first bar with `earlier: true` holds the km before the measurement started. */
  buckets: { key: string; km: number; beforeStart: boolean; earlier?: boolean }[];
  odometerKm: number | null;
  stats: {
    km: number;
    drivingDays: number;
    days: number;
    avgPerDay: number;
    maxDayKm: number;
    busiestWeekday: { day: string; km: number } | null;
  } | null;
  trips: (TripBlock & { startTemp: number | null })[];
  tripCount: number;
}

export interface ChargeBucket {
  key: string;
  ac: number;
  dc: number;
  beforeStart: boolean;
}

export interface ChargePeriod {
  mode: ChargePeriodMode;
  key: string;
  label: string;
  prev: string | null;
  next: string | null;
  bucket: 'day' | 'month';
  buckets: ChargeBucket[];
  totals: {
    sessions: number;
    kwh: number;
    ac: { sessions: number; kwh: number };
    dc: { sessions: number; kwh: number };
  };
  consumption: { kwhPer100km: number | null; km: number; usedKwh: number } | null;
  sessions: ChargingSession[];
  power: { avgKw: number | null; acKw: number | null; dcKw: number | null };
  green: GreenTotals | null;
}

export interface ChargingData {
  available: boolean;
  timeZone: string;
  batteryKwh: number;
  period: ChargePeriod | null;
  hasSoc: boolean;
  records: ChargingRecords | null;
  greenProgress: {
    totalKg: number;
    next: { name: string; icon: string; current: number; target: number; unit: string } | null;
  } | null;
}

export type SocRange = '24h' | '7d' | '30d';

export interface SocData {
  range: SocRange;
  from: number;
  to: number;
  soc: [number, number][];
  sessions: { start: number; end: number; type: 'AC' | 'DC' }[];
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
    timeline: { initial: TimelineEvent[]; events: TimelineEvent[] };
  } | null;
  period: HistoryPeriod | null;
  chargingRecords: ChargingRecords | null;
  monthly: MonthStats[];
  dailyTemps: [string, number][];
  hasTemperature: boolean;
  challenges: ChallengeEntry[];
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
  kind: 'week' | 'badge' | 'milestone' | 'challenge' | 'level' | 'rank' | 'record';
  name: string;
  description: string;
  icon: string;
  ts: number;
  xp: number;
  stats?: { label: string; value: string }[];
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
  green: GreenTotals | null;
  challengesDone: number;
}

export interface GreenTotals {
  co2Kg: number | null;
  liters: number;
  trees: number | null;
}

export interface MonthStats {
  month: string;
  km: number;
  kwh: number;
  kwhPer100km: number | null;
  avgTemp: number | null;
}

export interface ChallengeEntry {
  week: string;
  type: 'km' | 'days' | 'max_charges' | 'consumption';
  target: number;
  status: 'active' | 'done' | 'missed';
  current: number | null;
  completedTs: number | null;
  title: string;
  goal: string;
  unit: string;
}

export interface YearData {
  timeZone: string;
  preview: boolean;
  review: YearReview;
}
