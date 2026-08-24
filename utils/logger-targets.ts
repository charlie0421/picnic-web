/**
 * 백엔드 에러 로깅 및 모니터링 시스템 - 로그 대상 구현
 *
 * 콘솔과 Sentry 로그 대상을 구현합니다.
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

    // Error 는 await 앞에서 만든다. async 경계를 넘은 뒤 생성하면
    // entry.error 없이 message 만 로깅할 때 호출부 프레임이 사라진다.
    // 원본 오류 메시지를 함께 담는다. 로그 메시지만 남기면 Sentry 이슈에서
    // 실제 원인(invalid token 등)을 볼 수 없다.
    const error = new Error(
      entry.error?.message && entry.error.message !== entry.message
        ? `${entry.message}: ${entry.error.message}`
        : entry.message,
    );
    if (entry.error?.stack) {
      error.stack = entry.error.stack;
    }
    if (entry.error?.name) {
      error.name = entry.error.name;
    }

    try {
      const Sentry = await import('@sentry/nextjs');

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
          // Error 하위 클래스의 진단 필드(status, code, hint 등).
          // Logger 가 allowlist 로 수집한 값만 들어온다.
          ...(entry.error?.details ? { errorDetails: entry.error.details } : {}),
          ...(entry.request ? { request: entry.request } : {}),
        },
      });
    } catch (err) {
      // 로깅 실패가 요청을 깨뜨리면 안 된다.
      console.error('Sentry 로그 전송 실패:', err);
    }
  }
}
