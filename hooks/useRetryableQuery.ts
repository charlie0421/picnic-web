/**
 * React Query와 재시도 로직을 통합한 커스텀 훅
 *
 * 클라이언트 사이드에서 재시도 가능한 데이터 페칭을 위한 훅입니다.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ExtendedRetryUtility,
  NETWORK_RETRY_CONFIG,
} from '@/utils/retry';
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/contexts/ErrorContext';
import {
  useMutation,
  type RetryableQueryOptions,
  type RetryableQueryResult,
  type RetryableMutationOptions,
} from './retryable-query-types';

/**
 * 재시도 가능한 쿼리 훅 (글로벌 에러 시스템 통합)
 *
 * 비동기 작업을 실행하고 실패 시 자동으로 재시도합니다.
 * 에러를 글로벌 에러 상태로 전파할 수 있습니다.
 */
export function useRetryableQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: RetryableQueryOptions<T> = {}
): RetryableQueryResult<T> {
  const {
    enabled = true,
    fallbackData = null,
    retryConfig = {},
    onError,
    onRetry,
    onSuccess,
    operationName = 'query',
    propagateToGlobal = false,
    globalErrorOptions = { autoHide: true, duration: 5000 }
  } = options;

  const { handleError: addGlobalError } = useErrorHandler();

  const [data, setData] = useState<T | null>(fallbackData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const queryKeyRef = useRef<string>('');

  // 쿼리 키 문자열화
  const queryKeyString = JSON.stringify(queryKey);

  // 쿼리 실행 함수
  const executeQuery = useCallback(async (): Promise<T | null> => {
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 새 AbortController 생성
    abortControllerRef.current = new AbortController();
    const currentQueryKey = queryKeyString;
    queryKeyRef.current = currentQueryKey;

    setIsLoading(true);
    setError(null);

    try {
      const result = await ExtendedRetryUtility.withRetry(
        async () => {
          // 쿼리 키가 변경되었으면 중단
          if (queryKeyRef.current !== currentQueryKey) {
            throw new Error('Query cancelled due to key change');
          }

          return await queryFn();
        },
        {
          maxAttempts: 3,
          baseDelay: 1000,
          retryableCategories: [
            ErrorCategory.NETWORK,
            ErrorCategory.SERVER,
            ErrorCategory.EXTERNAL_SERVICE,
          ],
          ...retryConfig,
          onRetry: (error, attempt) => {
            setRetryCount(attempt);
            const appError = error instanceof AppError ? error : new AppError(
              error.message,
              ErrorCategory.UNKNOWN,
              ErrorSeverity.MEDIUM,
              500,
              { originalError: error }
            );
            onRetry?.(attempt, appError);
          },
        },
        operationName
      );

      if (result.success && queryKeyRef.current === currentQueryKey) {
        setData(result.data!);
        setRetryCount(0);
        onSuccess?.(result.data!);
        return result.data!;
      } else if (!result.success && queryKeyRef.current === currentQueryKey) {
        const appError = result.error instanceof AppError
          ? result.error
          : result.error
            ? new AppError(
                result.error.message,
                ErrorCategory.UNKNOWN,
                ErrorSeverity.MEDIUM,
                500,
                { originalError: result.error }
              )
            : new AppError(
                'Unknown error occurred',
                ErrorCategory.UNKNOWN,
                ErrorSeverity.MEDIUM,
                500
              );
        setError(appError);
        setRetryCount(result.attempts || 0);

        // 에러 로깅
        await logger.error(`Query failed: ${operationName}`, appError, {
          queryKey: queryKeyString,
          retryCount: result.attempts || 0,
          operationName,
        });

        // 글로벌 에러 상태로 전파
        if (propagateToGlobal) {
          addGlobalError(appError, globalErrorOptions);
        }

        // 사용자 정의 에러 핸들러 호출
        onError?.(appError);

        return null;
      }
    } catch (err) {
      if (queryKeyRef.current === currentQueryKey) {
        const appError = err instanceof AppError
          ? err
          : new AppError(
              err instanceof Error ? err.message : String(err),
              ErrorCategory.UNKNOWN,
              ErrorSeverity.MEDIUM,
              500,
              { originalError: err }
            );

        setError(appError);

        // 글로벌 에러 상태로 전파
        if (propagateToGlobal) {
          addGlobalError(appError, globalErrorOptions);
        }

        onError?.(appError);
        return null;
      }
    } finally {
      if (queryKeyRef.current === currentQueryKey) {
        setIsLoading(false);
      }
    }

    return null;
  }, [queryKeyString, queryFn, operationName, retryConfig, onError, onRetry, onSuccess, propagateToGlobal, globalErrorOptions, addGlobalError]);

  // 수동 재시도 함수
  const retry = useCallback(() => {
    if (error) {
      executeQuery();
    }
  }, [error, executeQuery]);

  // 쿼리 키 변경 시 자동 실행
  useEffect(() => {
    if (enabled) {
      executeQuery();
    }

    return () => {
      // 컴포넌트 언마운트 시 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, executeQuery]);

  // 재시도 가능 여부 계산
  const canRetry = error !== null && retryCount < (retryConfig.maxAttempts || 3);

  return {
    data,
    isLoading,
    error,
    retryCount,
    canRetry,
    refetch: executeQuery,
    retry,
  };
}

/**
 * 재시도 가능한 뮤테이션 훅
 */
export function useRetryableMutation<T, V = void>(
  mutationFn: (variables: V) => Promise<T>,
  options: RetryableMutationOptions<T, V> = {}
) {
  const { retryConfig, operationName, ...mutationOptions } = options;

  return useMutation({
    mutationFn: async (variables: V) => {
      const result = await ExtendedRetryUtility.withRetry(
        () => mutationFn(variables),
        {
          ...NETWORK_RETRY_CONFIG,
          maxAttempts: 2, // 뮤테이션은 재시도 횟수 제한
          ...retryConfig
        },
        operationName || 'mutation'
      );

      if (result.success) {
        return result.data!;
      } else {
        throw result.error;
      }
    },
    ...mutationOptions,
  });
}

// Barrel re-exports
export * from './retryable-query-types';
