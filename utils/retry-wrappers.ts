/**
 * 재시도 래퍼 함수, 조건 팩토리, 데코레이터, React Hook
 *
 * 다양한 시나리오에 맞는 재시도 래퍼를 제공합니다.
 */

import { AppError, ErrorCategory } from '@/utils/error';
import { ExtendedRetryUtility } from './retry-core';
import {
  DATABASE_RETRY_CONFIG,
  DEFAULT_RETRY_CONFIG,
  EXTERNAL_API_RETRY_CONFIG,
  ExtendedRetryConfig,
  NETWORK_RETRY_CONFIG,
  RetryCondition,
  RetryResult,
} from './retry-types';

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
