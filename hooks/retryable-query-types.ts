/**
 * 재시도 가능한 쿼리 관련 타입 정의 및 내부 useMutation 구현
 */

'use client';

import { useState, useCallback } from 'react';
import { ExtendedRetryConfig } from '@/utils/retry';
import { AppError } from '@/utils/error';

// React Query 타입 정의 (자체 구현)
export interface UseQueryOptions<T> {
  enabled?: boolean;
  onError?: (error: Error) => void;
  onSuccess?: (data: T) => void;
}

export interface UseMutationOptions<T, TError, TVariables> {
  onError?: (error: TError) => void;
  onSuccess?: (data: T, variables: TVariables) => void;
  onMutate?: (variables: TVariables) => void;
  mutationFn: (variables: TVariables) => Promise<T>;
}

// 간단한 useMutation 구현
export function useMutation<T, TError = Error, TVariables = void>(options: UseMutationOptions<T, TError, TVariables>) {
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
