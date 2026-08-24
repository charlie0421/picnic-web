/**
 * 백엔드 에러 로깅 및 모니터링 시스템 - 타입 정의
 *
 * 로그 레벨, 엔트리, 대상 인터페이스를 정의합니다.
 */

/**
 * 로그 레벨 정의
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * 로그 엔트리 인터페이스
 */
export interface LogEntry {
  id?: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    category?: string;
    statusCode?: number;
  };
  user?: {
    id?: string;
    email?: string;
  };
  request?: {
    method?: string;
    url?: string;
    userAgent?: string;
    ip?: string;
    headers?: Record<string, string>;
  };
  environment: string;
  service: string;
  version?: string;
}

/**
 * 로그 대상 인터페이스
 */
export interface LogTarget {
  name: string;
  write(entry: LogEntry): Promise<void>;
}
