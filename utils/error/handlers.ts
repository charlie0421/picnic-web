/**
 * 에러 핸들러, 변환기, 유틸리티 모듈
 */

import { PostgrestError } from '@supabase/supabase-js';

import { AppError, ErrorCategory, ErrorSeverity, DEFAULT_RETRY_CONFIG, type ErrorContext, type RetryConfig } from './core';
import { SocialAuthErrorCode, SocialAuthError, type SocialLoginProvider } from './social-auth-error';
import { DataFetchingErrorType, DataFetchingError } from './data-fetching-error';

/**
 * PostgreSQL 에러 코드와 AppError 매핑
 *
 * 각 PostgreSQL 에러 코드를 적절한 ErrorCategory, ErrorSeverity, HTTP 상태 코드로 매핑합니다.
 */
const PG_ERROR_MAPPING: Record<string, { category: ErrorCategory; severity: ErrorSeverity; statusCode: number }> = {
  // 인증/권한 관련
  '28P01': { category: ErrorCategory.AUTHENTICATION, severity: ErrorSeverity.MEDIUM, statusCode: 401 },
  '42501': { category: ErrorCategory.AUTHORIZATION, severity: ErrorSeverity.MEDIUM, statusCode: 403 },

  // RLS 정책 관련 (Supabase/PostgREST 특화)
  'PGRST301': { category: ErrorCategory.AUTHORIZATION, severity: ErrorSeverity.MEDIUM, statusCode: 403 },
  'PGRST204': { category: ErrorCategory.AUTHORIZATION, severity: ErrorSeverity.LOW, statusCode: 403 },
  'PGRST403': { category: ErrorCategory.AUTHORIZATION, severity: ErrorSeverity.MEDIUM, statusCode: 403 },

  // 데이터 관련
  '23505': { category: ErrorCategory.CONFLICT, severity: ErrorSeverity.LOW, statusCode: 409 },
  '23502': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  '23514': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  '22001': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },

  // 존재하지 않는 리소스
  '42P01': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.MEDIUM, statusCode: 404 },
  '42703': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.MEDIUM, statusCode: 404 },
  '22P02': { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.LOW, statusCode: 400 },
  '23503': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.MEDIUM, statusCode: 404 },

  // Supabase 특정 에러
  'PGRST116': { category: ErrorCategory.NOT_FOUND, severity: ErrorSeverity.LOW, statusCode: 404 },
};

/**
 * 에러 변환 유틸리티 클래스
 */
export class ErrorTransformer {
  /**
   * Supabase/PostgreSQL 에러를 AppError로 변환
   */
  static fromSupabaseError(error: PostgrestError, context?: ErrorContext): AppError {
    const mapping = PG_ERROR_MAPPING[error.code] || {
      category: ErrorCategory.SERVER,
      severity: ErrorSeverity.MEDIUM,
      statusCode: 500,
    };

    return new AppError(
      error.message || '데이터베이스 오류가 발생했습니다.',
      mapping.category,
      mapping.severity,
      mapping.statusCode,
      {
        context,
        originalError: error,
      }
    );
  }

  /**
   * 네트워크 에러를 AppError로 변환
   */
  static fromNetworkError(error: Error, context?: ErrorContext): AppError {
    const isTimeoutError = error.message.includes('timeout') || error.message.includes('TIMEOUT');
    const isConnectionError = error.message.includes('fetch') || error.message.includes('network');

    return new AppError(
      isTimeoutError ? '요청 시간이 초과되었습니다.' : '네트워크 연결에 실패했습니다.',
      ErrorCategory.NETWORK,
      isTimeoutError ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
      0,
      {
        isRetryable: true,
        context,
        originalError: error,
      }
    );
  }

  /**
   * 소셜 인증 에러를 새로운 SocialAuthError로 변환
   */
  static fromLegacySocialAuthError(
    code: SocialAuthErrorCode,
    message: string,
    provider?: SocialLoginProvider,
    originalError?: unknown,
    context?: ErrorContext
  ): SocialAuthError {
    return new SocialAuthError(code, message, provider, originalError, context);
  }

  /**
   * 데이터 페칭 에러를 새로운 DataFetchingError로 변환
   */
  static fromLegacyDataFetchingError(
    message: string,
    type: DataFetchingErrorType,
    statusCode: number,
    originalError?: unknown,
    context?: ErrorContext
  ): DataFetchingError {
    return new DataFetchingError(message, type, statusCode, originalError, context);
  }

  /**
   * 일반 에러를 AppError로 변환
   */
  static fromUnknownError(error: unknown, context?: ErrorContext): AppError {
    // 이미 AppError인 경우 그대로 반환
    if (error instanceof AppError) {
      return error;
    }

    // PostgrestError인 경우
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return this.fromSupabaseError(error as PostgrestError, context);
    }

    // 네트워크 에러인 경우
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
      return this.fromNetworkError(error, context);
    }

    // 일반 Error 객체인 경우
    if (error instanceof Error) {
      return new AppError(
        error.message,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500,
        {
          context,
          originalError: error,
        }
      );
    }

    // 기타 모든 경우
    return new AppError(
      typeof error === 'string' ? error : '알 수 없는 오류가 발생했습니다.',
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      500,
      {
        context,
        originalError: error,
      }
    );
  }
}

/**
 * 에러 로깅 인터페이스
 */
export interface ErrorLogger {
  log(error: AppError): void | Promise<void>;
}

/**
 * 콘솔 에러 로거
 */
export class ConsoleErrorLogger implements ErrorLogger {
  log(error: AppError): void {
    const logData = error.toLogData();

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error('🚨 CRITICAL ERROR:', logData);
        break;
      case ErrorSeverity.HIGH:
        console.error('❌ HIGH SEVERITY ERROR:', logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('⚠️ MEDIUM SEVERITY ERROR:', logData);
        break;
      case ErrorSeverity.LOW:
        console.info('ℹ️ LOW SEVERITY ERROR:', logData);
        break;
    }
  }
}

/**
 * 재시도 유틸리티
 */
export class RetryUtility {
  /**
   * 지수 백오프를 사용한 재시도 실행
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: ErrorContext
  ): Promise<T> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: AppError;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = ErrorTransformer.fromUnknownError(error, context);

        // 재시도 불가능한 에러인 경우 즉시 throw
        if (!lastError.isRetryable || !finalConfig.retryableCategories.includes(lastError.category)) {
          throw lastError;
        }

        // 마지막 시도인 경우 throw
        if (attempt === finalConfig.maxAttempts) {
          throw lastError;
        }

        // 백오프 지연
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
          finalConfig.maxDelay
        );

        console.warn(`재시도 ${attempt}/${finalConfig.maxAttempts} - ${delay}ms 후 재시도:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

/**
 * 중앙화된 에러 핸들러
 */
export class ErrorHandler {
  private static logger: ErrorLogger = new ConsoleErrorLogger();

  /**
   * 에러 로거 설정
   */
  static setLogger(logger: ErrorLogger): void {
    this.logger = logger;
  }

  /**
   * 에러 처리 및 로깅
   */
  static async handle(error: unknown, context?: ErrorContext): Promise<AppError> {
    const appError = ErrorTransformer.fromUnknownError(error, context);

    // 로깅
    try {
      await this.logger.log(appError);
    } catch (logError) {
      console.error('에러 로깅 실패:', logError);
    }

    return appError;
  }

  /**
   * 비동기 작업 래핑 (에러 처리 포함)
   */
  static async wrap<T>(
    operation: () => Promise<T>,
    context?: ErrorContext
  ): Promise<{ data?: T; error?: AppError }> {
    try {
      const data = await operation();
      return { data };
    } catch (error) {
      const appError = await this.handle(error, context);
      return { error: appError };
    }
  }

  /**
   * 재시도와 함께 비동기 작업 래핑
   */
  static async wrapWithRetry<T>(
    operation: () => Promise<T>,
    retryConfig?: Partial<RetryConfig>,
    context?: ErrorContext
  ): Promise<{ data?: T; error?: AppError }> {
    try {
      const data = await RetryUtility.withRetry(operation, retryConfig, context);
      return { data };
    } catch (error) {
      const appError = await this.handle(error, context);
      return { error: appError };
    }
  }
}

/**
 * 컨텍스트 생성 유틸리티
 */
export class ErrorContextBuilder {
  private context: ErrorContext = {};

  setUserId(userId: string): this {
    this.context.userId = userId;
    return this;
  }

  setSessionId(sessionId: string): this {
    this.context.sessionId = sessionId;
    return this;
  }

  setRequestId(requestId: string): this {
    this.context.requestId = requestId;
    return this;
  }

  setUserAgent(userAgent: string): this {
    this.context.userAgent = userAgent;
    return this;
  }

  setUrl(url: string): this {
    this.context.url = url;
    return this;
  }

  setAdditionalData(data: Record<string, unknown>): this {
    this.context.additionalData = { ...this.context.additionalData, ...data };
    return this;
  }

  build(): ErrorContext {
    return {
      ...this.context,
      timestamp: new Date(),
    };
  }
}

/**
 * 편의 함수들
 */

/**
 * 에러 생성 편의 함수
 */
export const createError = {
  authentication: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, { context }),

  authorization: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403, { context }),

  validation: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, { context }),

  notFound: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.NOT_FOUND, ErrorSeverity.LOW, 404, { context }),

  conflict: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.CONFLICT, ErrorSeverity.LOW, 409, { context }),

  network: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.NETWORK, ErrorSeverity.HIGH, 0, { context, isRetryable: true }),

  server: (message: string, context?: ErrorContext) =>
    new AppError(message, ErrorCategory.SERVER, ErrorSeverity.HIGH, 500, { context, isRetryable: true }),

  socialAuth: (code: SocialAuthErrorCode, message: string, provider?: SocialLoginProvider, context?: ErrorContext) =>
    new SocialAuthError(code, message, provider, undefined, context),

  dataFetching: (message: string, type: DataFetchingErrorType, statusCode: number = 500, context?: ErrorContext) =>
    new DataFetchingError(message, type, statusCode, undefined, context),
};

/**
 * 컨텍스트 빌더 생성 편의 함수
 */
export const createContext = () => new ErrorContextBuilder();

/**
 * 기존 코드와의 호환성을 위한 레거시 함수들
 */

/**
 * @deprecated Use ErrorTransformer.fromSupabaseError instead
 */
export const handleSupabaseError = (error: PostgrestError): AppError => {
  return ErrorTransformer.fromSupabaseError(error);
};

/**
 * @deprecated Use ErrorTransformer.fromUnknownError instead
 */
export const handleError = (error: unknown): AppError => {
  return ErrorTransformer.fromUnknownError(error);
};
