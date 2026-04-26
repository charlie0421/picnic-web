/**
 * 백엔드 에러 로깅 및 모니터링 시스템
 *
 * 다양한 로그 레벨과 컨텍스트를 지원하는 중앙화된 로깅 시스템입니다.
 */

import { AppError, ErrorSeverity } from '@/utils/error';
import { LogLevel, LogEntry, LogTarget } from './logger-types';
import { ConsoleLogTarget, SupabaseLogTarget } from './logger-targets';

// Barrel re-exports — 기존 import 경로(@/utils/logger) 유지
export * from './logger-types';
export { ConsoleLogTarget, SupabaseLogTarget, ExternalMonitoringTarget } from './logger-targets';


/**
 * 중앙화된 로거 클래스
 */
export class Logger {
  private targets: LogTarget[] = [];
  private environment: string;
  private service: string;
  private version?: string;

  constructor(options: {
    environment?: string;
    service?: string;
    version?: string;
    targets?: LogTarget[];
  } = {}) {
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.service = options.service || 'picnic-web';
    this.version = options.version || process.env.npm_package_version;

    // 기본 타겟 설정
    this.targets = options.targets || [
      new ConsoleLogTarget(),
      ...(this.environment === 'production' ? [new SupabaseLogTarget()] : []),
    ];
  }

  /**
   * 로그 타겟 추가
   */
  addTarget(target: LogTarget): void {
    this.targets.push(target);
  }

  /**
   * 로그 타겟 제거
   */
  removeTarget(targetName: string): void {
    this.targets = this.targets.filter(target => target.name !== targetName);
  }

  /**
   * 로그 엔트리 작성
   */
  private async writeLog(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error | AppError,
    user?: { id?: string; email?: string },
    request?: {
      method?: string;
      url?: string;
      userAgent?: string;
      ip?: string;
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      environment: this.environment,
      service: this.service,
      version: this.version,
    };

    // 에러 정보 추가
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof AppError && {
          category: error.category,
          statusCode: error.statusCode,
        }),
      };
    }

    // 사용자 정보 추가
    if (user) {
      entry.user = user;
    }

    // 요청 정보 추가
    if (request) {
      entry.request = request;
    }

    // 모든 타겟에 로그 작성
    await Promise.allSettled(
      this.targets.map(target => target.write(entry))
    );
  }

  /**
   * 디버그 로그
   */
  async debug(message: string, context?: Record<string, any>): Promise<void> {
    if (this.environment === 'development') {
      await this.writeLog(LogLevel.DEBUG, message, context);
    }
  }

  /**
   * 정보 로그
   */
  async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.writeLog(LogLevel.INFO, message, context);
  }

  /**
   * 경고 로그
   */
  async warn(message: string, context?: Record<string, any>): Promise<void> {
    await this.writeLog(LogLevel.WARN, message, context);
  }

  /**
   * 에러 로그
   */
  async error(
    message: string,
    error?: Error | AppError,
    context?: Record<string, any>,
    user?: { id?: string; email?: string },
    request?: {
      method?: string;
      url?: string;
      userAgent?: string;
      ip?: string;
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    await this.writeLog(LogLevel.ERROR, message, context, error, user, request);
  }

  /**
   * 치명적 에러 로그
   */
  async fatal(
    message: string,
    error?: Error | AppError,
    context?: Record<string, any>,
    user?: { id?: string; email?: string },
    request?: {
      method?: string;
      url?: string;
      userAgent?: string;
      ip?: string;
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    await this.writeLog(LogLevel.FATAL, message, context, error, user, request);
  }

  /**
   * AppError 전용 로깅 메서드
   */
  async logAppError(
    appError: AppError,
    context?: Record<string, any>,
    user?: { id?: string; email?: string },
    request?: {
      method?: string;
      url?: string;
      userAgent?: string;
      ip?: string;
      headers?: Record<string, string>;
    }
  ): Promise<void> {
    const level = appError.severity === ErrorSeverity.HIGH || appError.severity === ErrorSeverity.CRITICAL ? LogLevel.FATAL : LogLevel.ERROR;
    const message = `[${appError.category}] ${appError.message}`;

    const enhancedContext = {
      ...context,
      category: appError.category,
      severity: appError.severity,
      statusCode: appError.statusCode,
      isRetryable: appError.isRetryable,
      ...(appError.context && { errorContext: appError.context }),
    };

    await this.writeLog(level, message, enhancedContext, appError, user, request);
  }
}

/**
 * 글로벌 로거 인스턴스
 */
export const logger = new Logger();
