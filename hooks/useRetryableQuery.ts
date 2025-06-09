/**
 * React Query와 재시도 로직을 통합한 커스텀 훅
 * 
 * 클라이언트 사이드에서 재시도 가능한 데이터 페칭을 위한 훅입니다.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
// React Query 타입 정의 (자체 구현)
interface UseQueryOptions<T> {
  enabled?: boolean;
  onError?: (error: Error) => void;
  onSuccess?: (data: T) => void;
}

interface UseMutationOptions<T, TError, TVariables> {
  onError?: (error: TError) => void;
  onSuccess?: (data: T, variables: TVariables) => void;
  onMutate?: (variables: TVariables) => void;
  mutationFn: (variables: TVariables) => Promise<T>;
}

// 간단한 useMutation 구현
function useMutation<T, TError = Error, TVariables = void>(options: UseMutationOptions<T, TError, TVariables>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<TError | null>(null);
  const [data, setData] = useState<T | null>(null);

  const mutate = useCallback(async (variables: TVariables) => {
    setIsLoading(true);
    setError(null);
    
    try {
      options.onMutate?.(variables);
      const result = await options.mutationFn(variables);
      setData(result);
      options.onSuccess?.(result, variables);
      return result;
    } catch (err) {
      const error = err as TError;
      setError(error);
      options.onError?.(error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  return {
    mutate,
    isLoading,
    error,
    data,
  };
}
import { 
  ExtendedRetryUtility, 
  withNetworkRetry, 
  withExternalApiRetry,
  ExtendedRetryConfig,
  NETWORK_RETRY_CONFIG,
  createRetryCondition 
} from '@/utils/retry';
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { logger } from '@/utils/logger';
import { useErrorHandler } from '@/contexts/ErrorContext';

/**
 * 재시도 가능한 쿼리 옵션
 */
export interface RetryableQueryOptions<T> {
  enabled?: boolean;
  fallbackData?: T | null;
  retryConfig?: Partial<ExtendedRetryConfig>;
  onError?: (error: AppError) => void;
  onRetry?: (attempt: number, error: AppError) => void;
  onSuccess?: (data: T) => void;
  operationName?: string;
  propagateToGlobal?: boolean; // 글로벌 에러 상태로 전파할지 여부
  globalErrorOptions?: { autoHide?: boolean; duration?: number }; // 글로벌 에러 옵션
}

/**
 * 재시도 가능한 뮤테이션 옵션
 */
export interface RetryableMutationOptions<T, V> extends Omit<UseMutationOptions<T, Error, V>, 'mutationFn'> {
  retryConfig?: Partial<ExtendedRetryConfig>;
  operationName?: string;
}

/**
 * 재시도 가능한 쿼리 결과
 */
export interface RetryableQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: AppError | null;
  retryCount: number;
  canRetry: boolean;
  refetch: () => Promise<T | null>;
  retry: () => void;
}

/**
 * 재시도 가능한 쿼리 훅 (글로벌 에러 시스템 통합)
 * 
 * 비동기 작업을 실행하고 실패 시 자동으로 재시도합니다.
 * 에러를 글로벌 에러 상태로 전파할 수 있습니다.
 */
export function useRetryableQuery<T>(
  queryKey: any[],
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

/**
 * 네트워크 요청용 재시도 가능한 쿼리 훅 (글로벌 에러 통합)
 */
export function useNetworkQuery<T>(
  queryKey: any[],
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
  queryKey: any[],
  queryFn: () => Promise<{ data: T | null; error: any }>,
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
  queryKey: any[],
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
  queryKey: any[],
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
  queryKey: any[],
  queryFn: () => Promise<T>,
  options: RetryableQueryOptions<T> & { pollingInterval?: number } = {}
) {
  const { pollingInterval = 5000, ...queryOptions } = options;
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
  queryKey: any[],
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
  queryKey: any[],
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