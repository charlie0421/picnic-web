/**
 * 백엔드 에러 로깅 및 모니터링 시스템 - 로그 대상 구현
 *
 * 콘솔, Supabase, 외부 모니터링 서비스 로그 대상을 구현합니다.
 */

import { LogLevel, LogEntry, LogTarget } from './logger-types';

/**
 * 콘솔 로그 대상
 */
export class ConsoleLogTarget implements LogTarget {
  name = 'console';

  async write(entry: LogEntry): Promise<void> {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase();
    const message = entry.message;

    const logData = {
      timestamp,
      level,
      message,
      ...(entry.context && { context: entry.context }),
      ...(entry.error && { error: entry.error }),
      ...(entry.user && { user: entry.user }),
      ...(entry.request && { request: entry.request }),
    };

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`[${timestamp}] ${level}: ${message}`, logData);
        break;
      case LogLevel.INFO:
        console.info(`[${timestamp}] ${level}: ${message}`, logData);
        break;
      case LogLevel.WARN:
        console.warn(`[${timestamp}] ${level}: ${message}`, logData);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(`[${timestamp}] ${level}: ${message}`, logData);
        break;
      default:
        console.log(`[${timestamp}] ${level}: ${message}`, logData);
    }
  }
}

/**
 * Sentry 로그 대상
 *
 * ERROR / FATAL 레벨만 Sentry 로 보낸다. 그보다 낮은 레벨까지 보내면
 * 이슈 목록이 잡음으로 덮인다.
 */
export class SentryLogTarget implements LogTarget {
  name = 'sentry';

  async write(entry: LogEntry): Promise<void> {
    if (entry.level !== LogLevel.ERROR && entry.level !== LogLevel.FATAL) {
      return;
    }

    try {
      const Sentry = await import('@sentry/nextjs');

      // 원본 Error 를 재사용해야 스택 트레이스가 보존된다.
      const error = new Error(entry.message);
      if (entry.error?.stack) {
        error.stack = entry.error.stack;
      }
      if (entry.error?.name) {
        error.name = entry.error.name;
      }

      Sentry.captureException(error, {
        level: entry.level === LogLevel.FATAL ? 'fatal' : 'error',
        tags: {
          service: entry.service,
          environment: entry.environment,
          ...(entry.version ? { version: entry.version } : {}),
        },
        user: entry.user,
        contexts: {
          log: {
            timestamp: entry.timestamp,
            ...(entry.context ?? {}),
          },
          ...(entry.request ? { request: entry.request } : {}),
        },
      });
    } catch (err) {
      // 로깅 실패가 요청을 깨뜨리면 안 된다.
      console.error('Sentry 로그 전송 실패:', err);
    }
  }
}
