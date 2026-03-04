/**
 * 백엔드 에러 로깅 및 모니터링 시스템 - 로그 대상 구현
 *
 * 콘솔, Supabase, 외부 모니터링 서비스 로그 대상을 구현합니다.
 */

import { createServerActionClient } from '@/utils/supabase-server-client';
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
 * Supabase 로그 대상
 */
export class SupabaseLogTarget implements LogTarget {
  name = 'supabase';

  async write(entry: LogEntry): Promise<void> {
    try {
      const supabase = await createServerActionClient();

      const { error } = await supabase
        .from('error_logs')
        .insert({
          timestamp: entry.timestamp,
          level: entry.level,
          message: entry.message,
          context: entry.context || {},
          error_details: entry.error || null,
          user_details: entry.user || null,
          request_details: entry.request || null,
          environment: entry.environment,
          service: entry.service,
          version: entry.version || null,
        });

      if (error) {
        console.error('Supabase 로그 저장 실패:', error);
      }
    } catch (error) {
      console.error('Supabase 로그 대상 오류:', error);
    }
  }
}

/**
 * 외부 모니터링 서비스 로그 대상 (예: Sentry, LogRocket 등)
 */
export class ExternalMonitoringTarget implements LogTarget {
  name = 'external';

  async write(entry: LogEntry): Promise<void> {
    try {
      // 여기에 외부 모니터링 서비스 연동 로직 추가
      // 예: Sentry, LogRocket, DataDog 등

      if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
        // 에러 레벨의 로그만 외부 서비스로 전송
        await this.sendToExternalService(entry);
      }
    } catch (error) {
      console.error('외부 모니터링 서비스 전송 실패:', error);
    }
  }

  private async sendToExternalService(entry: LogEntry): Promise<void> {
    // 실제 외부 서비스 연동 구현
    // 예시: Sentry
    /*
    if (typeof window === 'undefined' && process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/node');
      Sentry.captureException(new Error(entry.message), {
        level: entry.level as any,
        contexts: {
          error: entry.error,
          user: entry.user,
          request: entry.request,
        },
        tags: {
          environment: entry.environment,
          service: entry.service,
        },
      });
    }
    */
  }
}
