/**
 * 백엔드 에러 로깅 및 모니터링 시스템 - 유틸리티
 *
 * 요청 로거, 성능 타이머, 로깅 데코레이터를 제공합니다.
 */

import { AppError } from '@/utils/error';
import { Logger, logger } from './logger';

/**
 * 요청 컨텍스트에서 로거 생성
 */
export function createRequestLogger(request: Request): Logger {
  const requestLogger = new Logger();

  // 요청 정보 추출
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || undefined;
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             undefined;

  // 요청별 컨텍스트 설정
  const requestContext = {
    method: request.method,
    url: url.pathname + url.search,
    userAgent,
    ip,
    headers: Object.fromEntries(request.headers.entries()),
  };

  // 로거 메서드 오버라이드하여 요청 컨텍스트 자동 추가
  const originalError = requestLogger.error.bind(requestLogger);
  const originalFatal = requestLogger.fatal.bind(requestLogger);
  const originalLogAppError = requestLogger.logAppError.bind(requestLogger);

  requestLogger.error = async (message, error, context, user) => {
    return originalError(message, error, context, user, requestContext);
  };

  requestLogger.fatal = async (message, error, context, user) => {
    return originalFatal(message, error, context, user, requestContext);
  };

  requestLogger.logAppError = async (appError, context, user) => {
    return originalLogAppError(appError, context, user, requestContext);
  };

  return requestLogger;
}

/**
 * 성능 모니터링을 위한 타이머 클래스
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: Logger;
  private operation: string;

  constructor(operation: string, loggerInstance?: Logger) {
    this.operation = operation;
    this.logger = loggerInstance || logger;
    this.startTime = Date.now();
  }

  /**
   * 타이머 종료 및 로깅
   */
  async end(context?: Record<string, any>): Promise<number> {
    const duration = Date.now() - this.startTime;

    await this.logger.info(`Operation completed: ${this.operation}`, {
      ...context,
      duration,
      operation: this.operation,
    });

    return duration;
  }

  /**
   * 타이머 종료 및 에러 로깅
   */
  async endWithError(error: Error | AppError, context?: Record<string, any>): Promise<number> {
    const duration = Date.now() - this.startTime;

    await this.logger.error(`Operation failed: ${this.operation}`, error, {
      ...context,
      duration,
      operation: this.operation,
    });

    return duration;
  }
}

/**
 * 성능 타이머 생성 헬퍼
 */
export function startTimer(operation: string, loggerInstance?: Logger): PerformanceTimer {
  return new PerformanceTimer(operation, loggerInstance);
}

/**
 * 로깅 데코레이터 (함수 래핑용)
 */
export function withLogging<T extends (...args: any[]) => any>(
  fn: T,
  operation: string,
  loggerInstance?: Logger
): T {
  return (async (...args: any[]) => {
    const timer = startTimer(operation, loggerInstance);

    try {
      const result = await fn(...args);
      await timer.end({ args: args.length });
      return result;
    } catch (error) {
      await timer.endWithError(error as Error, { args: args.length });
      throw error;
    }
  }) as T;
}
