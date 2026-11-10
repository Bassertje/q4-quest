export type ConnectionState =
  | 'mock'
  | 'not_configured'
  | 'connecting'
  | 'connected'
  | 'auth_failed'
  | 'disconnected';

export interface HaStatus {
  state: ConnectionState;
  haVersion: string | null;
  timeZone: string | null;
  connectedSince: string | null;
  lastError: string | null;
}
