/**
 * 백엔드 에러 로깅 및 모니터링 시스템
 * 
 * 다양한 로그 레벨과 컨텍스트를 지원하는 중앙화된 로깅 시스템입니다.
 */

import { createServerActionClient } from '@/utils/supabase-server-client';
import { AppError, ErrorContext } from '@/utils/error';

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
    const level = appError.severity === 'high' ? LogLevel.FATAL : LogLevel.ERROR;
    const message = `[${appError.category}] ${appError.message}`;
    
    const enhancedContext = {
      ...context,
      errorId: appError.id,
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

  constructor(operation: string, logger: Logger = logger) {
    this.operation = operation;
    this.logger = logger;
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
export function startTimer(operation: string, logger?: Logger): PerformanceTimer {
  return new PerformanceTimer(operation, logger);
}

/**
 * 로깅 데코레이터 (함수 래핑용)
 */
export function withLogging<T extends (...args: any[]) => any>(
  fn: T,
  operation: string,
  logger: Logger = logger
): T {
  return (async (...args: any[]) => {
    const timer = startTimer(operation, logger);
    
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