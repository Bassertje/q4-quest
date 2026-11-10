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
    lastMilestone: { milestone: Milestone; ts: number } | null;
    moon: { km: number; fraction: number };
    distance: { today: number; week: number; month: number };
    streak: number;
  } | null;
  soc: { value: number; ts: number } | null;
  range: { value: number; ts: number } | null;
}

export interface StatusData {
  version: string;
  mode: 'mock' | 'live';
  setupNeeded: boolean;
  ha: { state: string; haVersion: string | null; timeZone: string | null; lastError: string | null };
  timeZone: string;
  sensors: { key: string; entityId: string | null; configured: boolean }[];
  batteryKwh: number;
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
