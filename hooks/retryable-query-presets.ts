/**
 * 특화된 재시도 가능한 쿼리 프리셋 훅들
 *
 * 네트워크, Supabase, 투표, 인증, 실시간, 파일 업로드 등
 * 각 도메인에 최적화된 재시도 설정을 제공합니다.
 */

'use client';

import { useState, useEffect } from 'react';
import { createRetryCondition } from '@/utils/retry';
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { logger } from '@/utils/logger';
import { useRetryableQuery, useRetryableMutation } from './useRetryableQuery';
import type { RetryableQueryOptions, RetryableMutationOptions } from './retryable-query-types';

/**
 * 네트워크 요청용 재시도 가능한 쿼리 훅 (글로벌 에러 통합)
 */
export function useNetworkQuery<T>(
  queryKey: unknown[],
  url: string,
  options: RetryableQueryOptions<T> & { fetchOptions?: RequestInit } = {}
) {
  const { fetchOptions, ...queryOptions } = options;

  return useRetryableQuery(
    queryKey,
    async () => {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new AppError(
          `HTTP ${response.status}: ${response.statusText}`,
          ErrorCategory.NETWORK,
          response.status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
          response.status
        );
      }

      return response.json();
    },
    {
      ...queryOptions,
      operationName: `network-${url}`,
      propagateToGlobal: queryOptions.propagateToGlobal ?? true, // 네트워크 에러는 기본적으로 글로벌로 전파
    }
  );
}

/**
 * Supabase 쿼리용 재시도 가능한 훅 (글로벌 에러 통합)
 */
export function useSupabaseQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<{ data: T | null; error: (Error & { [key: string]: unknown }) | null }>,
  options: RetryableQueryOptions<T> = {}
) {
  return useRetryableQuery(
    queryKey,
    async () => {
      const { data, error } = await queryFn();

      if (error) {
        await logger.error('Supabase query error', error, {
          operation: 'useSupabaseQuery',
          queryKey: queryKey.join('-'),
        });

        throw new AppError(
          error.message || '데이터 조회 중 오류가 발생했습니다.',
          ErrorCategory.DATA_FETCHING,
          ErrorSeverity.MEDIUM,
          500,
          { originalError: error }
        );
      }

      return data!;
    },
    {
      retryConfig: {
        retryableCategories: [
          ErrorCategory.NETWORK,
          ErrorCategory.SERVER,
          ErrorCategory.DATA_FETCHING,
        ],
      },
      ...options,
      operationName: `supabase-${queryKey.join('-')}`,
      propagateToGlobal: options.propagateToGlobal ?? true, // Supabase 에러도 기본적으로 글로벌로 전파
    }
  );
}

/**
 * 투표 관련 쿼리용 특화된 훅
 */
export function useVoteQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: RetryableQueryOptions<T> = {}
) {
  return useRetryableQuery(
    queryKey,
    queryFn,
    {
      retryConfig: {
        maxAttempts: 3,
        baseDelay: 1000,
        retryCondition: createRetryCondition.or(
          createRetryCondition.httpStatus([500, 502, 503, 504]),
          createRetryCondition.errorMessage(['network', 'timeout', 'connection'])
        ),
      },

      ...options,
      operationName: `vote-${queryKey.join('-')}`,
    }
  );
}

/**
 * 투표 제출용 뮤테이션 훅
 */
export function useVoteMutation<T, V = void>(
  mutationFn: (variables: V) => Promise<T>,
  options: RetryableMutationOptions<T, V> = {}
) {
  return useRetryableMutation(
    mutationFn,
    {
      retryConfig: {
        maxAttempts: 2, // 투표는 중복 방지를 위해 재시도 제한
        baseDelay: 1000,
        retryCondition: createRetryCondition.and(
          createRetryCondition.httpStatus([500, 502, 503, 504]),
          createRetryCondition.maxAttempts(2)
        ),
      },
      ...options,
      operationName: 'vote-mutation',
    }
  );
}

/**
 * 인증 관련 쿼리용 특화된 훅
 */
export function useAuthQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: RetryableQueryOptions<T> = {}
) {
  return useRetryableQuery(
    queryKey,
    queryFn,
    {
      retryConfig: {
        maxAttempts: 2, // 인증 에러는 재시도 횟수 제한
        retryableCategories: [ErrorCategory.NETWORK],
      },
      ...options,
      operationName: `auth-${queryKey.join('-')}`,
      propagateToGlobal: options.propagateToGlobal ?? false, // 인증 에러는 기본적으로 글로벌로 전파하지 않음
    }
  );
}

/**
 * 실시간 데이터용 쿼리 훅
 */
export function useRealtimeQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: RetryableQueryOptions<T> & { pollingInterval?: number } = {}
) {
  const { pollingInterval = 1000, ...queryOptions } = options;
  const [isPolling, setIsPolling] = useState(false);

  const result = useRetryableQuery(
    queryKey,
    queryFn,
    {
      ...queryOptions,
      operationName: `realtime-${queryKey.join('-')}`,
      propagateToGlobal: queryOptions.propagateToGlobal ?? false, // 실시간 에러는 조용히 처리
    }
  );

  // 폴링 로직
  useEffect(() => {
    if (!isPolling || !result.data) return;

    const interval = setInterval(() => {
      result.refetch();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [isPolling, result.data, result.refetch, pollingInterval]);

  return {
    ...result,
    startPolling: () => setIsPolling(true),
    stopPolling: () => setIsPolling(false),
    isPolling,
  };
}

/**
 * 파일 업로드용 쿼리 훅
 */
export function useFileUploadQuery<T>(
  queryKey: unknown[],
  uploadFn: () => Promise<T>,
  options: RetryableQueryOptions<T> = {}
) {
  return useRetryableQuery(
    queryKey,
    uploadFn,
    {
      retryConfig: {
        maxAttempts: 2,
        baseDelay: 2000,
        retryableCategories: [ErrorCategory.NETWORK],
      },
      ...options,
      operationName: `upload-${queryKey.join('-')}`,
      propagateToGlobal: options.propagateToGlobal ?? true,
      globalErrorOptions: {
        autoHide: false, // 업로드 에러는 수동으로 해제
        duration: undefined,
        ...options.globalErrorOptions,
      },
    }
  );
}

/**
 * 에러 바운더리와 함께 사용할 수 있는 재시도 가능한 쿼리 훅
 */
export function useSafeRetryableQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options: RetryableQueryOptions<T> & {
    fallbackData?: T;
    onError?: (error: Error) => void;
  } = {}
) {
  const { fallbackData, onError, ...queryOptions } = options;

  const query = useRetryableQuery(queryKey, queryFn, {
    ...queryOptions,
    onError: (error) => {
      // 에러 로깅
      logger.error('Query failed after retries', error as Error, {
        queryKey: queryKey.join('-'),
        operation: 'useSafeRetryableQuery',
      });

      // 커스텀 에러 핸들러 실행
      onError?.(error as Error);
    },
  });

  // 에러 발생 시 fallback 데이터 반환
  if (query.error && fallbackData !== undefined) {
    return {
      ...query,
      data: fallbackData,
      isError: false,
      error: null,
    };
  }

  return query;
}
