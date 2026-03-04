/**
 * 에러 재시도, 로깅, 컨텍스트 빌더 유틸리티 모듈
 *
 * handlers.ts 에서 분리된 모듈로, ./core 에만 의존합니다.
 * 순환 의존성 방지를 위해 RetryUtility.withRetry()는 선택적
 * errorTransformer 콜백을 받습니다.
 */

import { AppError, ErrorCategory, ErrorSeverity, DEFAULT_RETRY_CONFIG, type ErrorContext, type RetryConfig } from './core';

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
 * 재시도 유틸리티
 */
export class RetryUtility {
  /**
   * 지수 백오프를 사용한 재시도 실행
   *
   * @param errorTransformer - unknown 에러를 AppError로 변환하는 선택적 콜백.
   *   제공되지 않으면 기본 AppError 변환을 사용합니다.
   *   순환 의존성 방지를 위해 handlers.ts 에서 ErrorTransformer.fromUnknownError 를 전달합니다.
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: ErrorContext,
    errorTransformer?: (error: unknown, context?: ErrorContext) => AppError
  ): Promise<T> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: AppError;

    const transformError = errorTransformer ?? RetryUtility.defaultTransformError;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = transformError(error, context);

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

  /**
   * 기본 에러 변환 (순환 의존성 없이 사용 가능)
   */
  private static defaultTransformError(error: unknown, context?: ErrorContext): AppError {
    if (error instanceof AppError) {
      return error;
    }

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
