/**
 * 백엔드 에러 로깅 및 모니터링 시스템
 *
 * 다양한 로그 레벨과 컨텍스트를 지원하는 중앙화된 로깅 시스템입니다.
 */

import { AppError, ErrorSeverity } from '@/utils/error';
import { LogLevel, LogEntry, LogTarget } from './logger-types';
import { ConsoleLogTarget, SentryLogTarget } from './logger-targets';

// Barrel re-exports — 기존 import 경로(@/utils/logger) 유지
export * from './logger-types';
export { ConsoleLogTarget, SentryLogTarget } from './logger-targets';


/**
 * details 로 수집할 진단 필드 allowlist.
 *
 * 열거 가능한 모든 필드를 담으면 안 된다. jose 의 JWTExpired 는 payload 에
 * JWT Claims Set 전체(sub, email, nonce)를 들고 있어 그대로 로그에 실린다.
 * 알려진 진단 필드만 명시적으로 허용한다.
 */
const ALLOWED_ERROR_DETAIL_KEYS = new Set([
  'status',      // Supabase AuthApiError, HTTP 계열
  'statusCode',
  'code',        // Supabase, jose, PostgREST
  'hint',        // PostgrestError
  'details',     // PostgrestError (문자열 설명)
  'claim',       // jose — 실패한 클레임 이름
  'reason',      // jose — 실패 사유 코드
  'type',        // PortOne
]);

/** details 값의 길이 상한. 큰 객체가 로그를 뒤덮지 않게 한다. */
const MAX_DETAIL_STRING = 500;

/**
 * Error 하위 클래스가 들고 있는 추가 진단 필드를 수집한다.
 *
 * Supabase AuthApiError 의 status/code, PortOne 오류 코드처럼
 * console.error 가 보여 주던 정보가 name/message/stack 만 담으면 사라진다.
 */
function collectErrorDetails(error: Error): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};

  try {
    for (const key of Object.keys(error)) {
      if (!ALLOWED_ERROR_DETAIL_KEYS.has(key)) continue;
      try {
        const value = (error as unknown as Record<string, unknown>)[key];
        if (value === undefined) continue;
        out[key] = typeof value === 'object' && value !== null ? shallowDescribe(value) : truncate(value);
      } catch {
        out[key] = '[Unreadable]';
      }
    }

    // cause 는 Error 일 때만, 그것도 name/message 만 담는다.
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      out.cause = { name: cause.name, message: truncate(cause.message) };
    }
  } catch {
    return undefined;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** 긴 문자열을 자른다. */
function truncate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.length > MAX_DETAIL_STRING ? `${value.slice(0, MAX_DETAIL_STRING)}…` : value;
}

/** 중첩 값을 한 겹만 문자열/원시값으로 요약한다. */
function shallowDescribe(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return `[Array(${value.length})]`;
  const out: Record<string, unknown> = {};
  try {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      const v = (value as Record<string, unknown>)[k];
      out[k] = typeof v === 'object' && v !== null ? '[Object]' : v;
    }
  } catch {
    return '[Unreadable]';
  }
  return out;
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
      ...(this.environment === 'production' ? [new SentryLogTarget()] : []),
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
      const details = collectErrorDetails(error);
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof AppError && {
          category: error.category,
          statusCode: error.statusCode,
        }),
        ...(details && { details }),
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
