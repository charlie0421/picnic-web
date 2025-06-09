/**
 * 확장된 재시도 로직 유틸리티
 * 
 * 다양한 시나리오에 대한 재시도 메커니즘을 제공합니다.
 */

import { AppError, ErrorCategory, ErrorSeverity, RetryConfig, createContext } from '@/utils/error';
import { logger } from '@/utils/logger';

/**
 * 재시도 전략 타입
 */
export enum RetryStrategy {
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  LINEAR_BACKOFF = 'linear_backoff',
  FIXED_DELAY = 'fixed_delay',
  IMMEDIATE = 'immediate',
}

/**
 * 재시도 조건 함수 타입
 */
export type RetryCondition = (error: Error | AppError, attempt: number) => boolean;

/**
 * 확장된 재시도 설정
 */
export interface ExtendedRetryConfig extends RetryConfig {
  strategy: RetryStrategy;
  jitter: boolean; // 지터 추가 여부
  onRetry?: (error: Error | AppError, attempt: number) => void | Promise<void>;
  retryCondition?: RetryCondition;
  timeoutMs?: number; // 전체 작업 타임아웃
}

/**
 * 재시도 결과 인터페이스
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error | AppError;
  attempts: number;
  totalDuration: number;
  lastAttemptAt: Date;
}

/**
 * 기본 재시도 설정
 */
export const DEFAULT_RETRY_CONFIG: ExtendedRetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
  jitter: true,
  retryableCategories: [
    ErrorCategory.NETWORK,
    ErrorCategory.SERVER,
    ErrorCategory.EXTERNAL_SERVICE,
  ],
};

/**
 * 네트워크 요청용 재시도 설정
 */
export const NETWORK_RETRY_CONFIG: ExtendedRetryConfig = {
  ...DEFAULT_RETRY_CONFIG,
  maxAttempts: 5,
  baseDelay: 500,
  maxDelay: 5000,
  strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
  jitter: true,
};

/**
 * 데이터베이스 작업용 재시도 설정
 */
export const DATABASE_RETRY_CONFIG: ExtendedRetryConfig = {
  ...DEFAULT_RETRY_CONFIG,
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
  retryableCategories: [
    ErrorCategory.SERVER,
    ErrorCategory.NETWORK,
  ],
};

/**
 * 외부 API 호출용 재시도 설정
 */
export const EXTERNAL_API_RETRY_CONFIG: ExtendedRetryConfig = {
  ...DEFAULT_RETRY_CONFIG,
  maxAttempts: 4,
  baseDelay: 2000,
  maxDelay: 15000,
  strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
  jitter: true,
  retryableCategories: [
    ErrorCategory.NETWORK,
    ErrorCategory.EXTERNAL_SERVICE,
    ErrorCategory.SERVER,
  ],
};

/**
 * 확장된 재시도 유틸리티 클래스
 */
export class ExtendedRetryUtility {
  /**
   * 재시도 로직과 함께 작업 실행
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<ExtendedRetryConfig> = {},
    operationName?: string
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | AppError;
    let attempts = 0;

    // 타임아웃 설정
    const timeoutPromise = finalConfig.timeoutMs
      ? new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new AppError(
              `작업 타임아웃: ${finalConfig.timeoutMs}ms 초과`,
              ErrorCategory.CLIENT,
              ErrorSeverity.MEDIUM,
              408
            ));
          }, finalConfig.timeoutMs);
        })
      : null;

    while (attempts < finalConfig.maxAttempts) {
      attempts++;

      try {
        // 타임아웃이 설정된 경우 Promise.race 사용
        const result = timeoutPromise
          ? await Promise.race([operation(), timeoutPromise])
          : await operation();

        // 성공 로깅
        if (attempts > 1) {
          await logger.info(`재시도 성공: ${operationName || 'unknown'}`, {
            attempts,
            totalDuration: Date.now() - startTime,
            operationName,
          });
        }

        return {
          success: true,
          data: result,
          attempts,
          totalDuration: Date.now() - startTime,
          lastAttemptAt: new Date(),
        };

      } catch (error) {
        lastError = error instanceof AppError ? error : new AppError(
          error instanceof Error ? error.message : String(error),
          ErrorCategory.UNKNOWN,
          ErrorSeverity.MEDIUM,
          500,
          { originalError: error }
        );

        // 재시도 조건 확인
        const shouldRetry = this.shouldRetry(lastError, attempts, finalConfig);

        if (!shouldRetry || attempts >= finalConfig.maxAttempts) {
          // 최종 실패 로깅
          await logger.error(`재시도 최종 실패: ${operationName || 'unknown'}`, lastError, {
            attempts,
            totalDuration: Date.now() - startTime,
            operationName,
            maxAttempts: finalConfig.maxAttempts,
          });

          return {
            success: false,
            error: lastError,
            attempts,
            totalDuration: Date.now() - startTime,
            lastAttemptAt: new Date(),
          };
        }

        // 재시도 콜백 실행
        if (finalConfig.onRetry) {
          try {
            await finalConfig.onRetry(lastError, attempts);
          } catch (callbackError) {
            await logger.warn('재시도 콜백 실행 실패', {
              operationName,
              attempt: attempts,
              error: callbackError,
            });
          }
        }

        // 재시도 로깅
        await logger.warn(`재시도 시도 ${attempts}/${finalConfig.maxAttempts}: ${operationName || 'unknown'}`, {
          attempt: attempts,
          maxAttempts: finalConfig.maxAttempts,
          operationName,
          nextDelayMs: this.calculateDelay(attempts, finalConfig),
          error: lastError,
        });

        // 마지막 시도가 아니면 지연
        if (attempts < finalConfig.maxAttempts) {
          const delay = this.calculateDelay(attempts, finalConfig);
          await this.sleep(delay);
        }
      }
    }

    // 이 지점에 도달하면 안 되지만, 안전장치
    return {
      success: false,
      error: lastError!,
      attempts,
      totalDuration: Date.now() - startTime,
      lastAttemptAt: new Date(),
    };
  }

  /**
   * 재시도 여부 결정
   */
  private static shouldRetry(
    error: Error | AppError,
    attempt: number,
    config: ExtendedRetryConfig
  ): boolean {
    // 커스텀 재시도 조건이 있으면 우선 적용
    if (config.retryCondition) {
      return config.retryCondition(error, attempt);
    }

    // AppError인 경우 재시도 가능 여부 확인
    if (error instanceof AppError) {
      return error.isRetryable && config.retryableCategories.includes(error.category);
    }

    // 일반 Error인 경우 네트워크 에러로 간주하여 재시도
    return config.retryableCategories.includes(ErrorCategory.NETWORK);
  }

  /**
   * 지연 시간 계산
   */
  private static calculateDelay(attempt: number, config: ExtendedRetryConfig): number {
    let delay: number;

    switch (config.strategy) {
      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        break;

      case RetryStrategy.LINEAR_BACKOFF:
        delay = Math.min(
          config.baseDelay * attempt,
          config.maxDelay
        );
        break;

      case RetryStrategy.FIXED_DELAY:
        delay = config.baseDelay;
        break;

      case RetryStrategy.IMMEDIATE:
        delay = 0;
        break;

      default:
        delay = config.baseDelay;
    }

    // 지터 추가 (랜덤 요소로 동시 재시도 방지)
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% 지터
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }

    return Math.max(0, Math.floor(delay));
  }

  /**
   * 지연 함수
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 네트워크 요청 재시도 래퍼
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<RetryResult<T>> {
  return ExtendedRetryUtility.withRetry(
    operation,
    NETWORK_RETRY_CONFIG,
    operationName
  );
}

/**
 * 데이터베이스 작업 재시도 래퍼
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<RetryResult<T>> {
  return ExtendedRetryUtility.withRetry(
    operation,
    DATABASE_RETRY_CONFIG,
    operationName
  );
}

/**
 * 외부 API 호출 재시도 래퍼
 */
export async function withExternalApiRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<RetryResult<T>> {
  return ExtendedRetryUtility.withRetry(
    operation,
    EXTERNAL_API_RETRY_CONFIG,
    operationName
  );
}

/**
 * 커스텀 재시도 조건 생성 헬퍼
 */
export const createRetryCondition = {
  /**
   * HTTP 상태 코드 기반 재시도 조건
   */
  httpStatus: (retryableStatusCodes: number[]): RetryCondition => {
    return (error: Error | AppError) => {
      if (error instanceof AppError) {
        return retryableStatusCodes.includes(error.statusCode);
      }
      return false;
    };
  },

  /**
   * 에러 메시지 기반 재시도 조건
   */
  errorMessage: (retryableMessages: string[]): RetryCondition => {
    return (error: Error | AppError) => {
      return retryableMessages.some(msg => 
        error.message.toLowerCase().includes(msg.toLowerCase())
      );
    };
  },

  /**
   * 최대 시도 횟수 기반 재시도 조건
   */
  maxAttempts: (maxAttempts: number): RetryCondition => {
    return (error: Error | AppError, attempt: number) => {
      return attempt < maxAttempts;
    };
  },

  /**
   * 복합 조건 (AND)
   */
  and: (...conditions: RetryCondition[]): RetryCondition => {
    return (error: Error | AppError, attempt: number) => {
      return conditions.every(condition => condition(error, attempt));
    };
  },

  /**
   * 복합 조건 (OR)
   */
  or: (...conditions: RetryCondition[]): RetryCondition => {
    return (error: Error | AppError, attempt: number) => {
      return conditions.some(condition => condition(error, attempt));
    };
  },
};

/**
 * 함수 데코레이터: 자동 재시도 적용
 */
export function withAutoRetry<TArgs extends any[], TReturn>(
  config: Partial<ExtendedRetryConfig> = {},
  operationName?: string
) {
  return function decorator(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: TArgs) => Promise<TReturn>>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (...args: TArgs): Promise<TReturn> {
      const result = await ExtendedRetryUtility.withRetry(
        () => originalMethod.apply(this, args),
        config,
        operationName || `${target.constructor.name}.${propertyKey}`
      );

      if (result.success) {
        return result.data!;
      } else {
        throw result.error;
      }
    };

    return descriptor;
  };
}

/**
 * React Hook: 재시도 가능한 비동기 작업
 */
export function useRetryableOperation<T>() {
  const executeWithRetry = async (
    operation: () => Promise<T>,
    config?: Partial<ExtendedRetryConfig>,
    operationName?: string
  ): Promise<RetryResult<T>> => {
    return ExtendedRetryUtility.withRetry(operation, config, operationName);
  };

  return { executeWithRetry };
}

/**
 * 서버 액션용 재시도 래퍼
 */
export async function withServerActionRetry<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<{ success: boolean; data?: T; error?: string; attempts?: number }> {
  const result = await ExtendedRetryUtility.withRetry(
    operation,
    {
      ...DEFAULT_RETRY_CONFIG,
      maxAttempts: 2, // 서버 액션은 재시도 횟수 제한
      baseDelay: 500,
      maxDelay: 2000,
    },
    operationName
  );

  return {
    success: result.success,
    data: result.data,
    error: result.error?.message,
    attempts: result.attempts,
  };
}

/**
 * 배치 작업용 재시도 래퍼
 */
export async function withBatchRetry<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<ExtendedRetryConfig> = {},
  operationName?: string
): Promise<Array<RetryResult<T>>> {
  const results = await Promise.allSettled(
    operations.map((operation, index) =>
      ExtendedRetryUtility.withRetry(
        operation,
        config,
        `${operationName || 'batch'}-${index}`
      )
    )
  );

  return results.map(result => 
    result.status === 'fulfilled' 
      ? result.value 
      : {
          success: false,
          error: new AppError('배치 작업 실패', ErrorCategory.SERVER),
          attempts: 0,
          totalDuration: 0,
          lastAttemptAt: new Date(),
        }
  );
} 