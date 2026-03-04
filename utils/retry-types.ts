/**
 * 재시도 로직 타입, 인터페이스, 프리셋 설정
 *
 * retry-core 및 retry-wrappers에서 사용하는 공통 타입을 정의합니다.
 */

import { AppError, ErrorCategory, ErrorSeverity, RetryConfig } from '@/utils/error';

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
