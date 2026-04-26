export interface NotificationState {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: Date;
}

export type DataSourceMode = 'realtime' | 'polling' | 'static';

export interface ConnectionState {
  mode: DataSourceMode;
  isConnected: boolean;
  lastUpdate: Date | null;
  errorCount: number;
  retryCount: number;
}

export interface ConnectionQuality {
  score: number;
  latency: number;
  errorRate: number;
  consecutiveErrors: number;
  consecutiveSuccesses: number;
  lastConnectionTime: Date | null;
  averageResponseTime: number;
}

export interface ThresholdConfig {
  maxErrorCount: number;
  maxConsecutiveErrors: number;
  minConnectionQuality: number;
  realtimeRetryDelay: number;
  pollingInterval: number;
  qualityCheckInterval: number;
}

/** Connection quality scoring weights */
export const ERROR_RATE_PENALTY = 50;
export const CONSECUTIVE_ERROR_PENALTY = 15;

/** Polling log throttle interval (ms) */
export const POLLING_LOG_THROTTLE_MS = 5000;

/** Default notification duration (ms) */
export const DEFAULT_NOTIFICATION_DURATION_MS = 5000;

/** Debounce delay for search input (ms) */
export const SEARCH_DEBOUNCE_MS = 300;

/** Header height recalculation delay (ms) */
export const HEADER_RECALC_DELAY_MS = 100;

export interface VoteDetailPresenterProps {
  vote: import('@/types/interfaces').Vote;
  initialItems: import('@/types/interfaces').VoteItem[];
  rewards?: any[];
  className?: string;
  enableRealtime?: boolean;
  pollingInterval?: number;
  maxRetries?: number;
  lang: import('@/config/settings').Language;
}
