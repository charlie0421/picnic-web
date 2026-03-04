/**
 * 향상된 API 요청 실패 시 재시도 및 성능 최적화 기능
 * - 타임아웃 관리
 * - 지능형 재시도
 * - 회로 차단기 패턴
 * - 요청 큐잉
 */

import { withTimeout } from './retry-utils';
import {
  globalCircuitBreaker,
  calculateDelayWithJitter,
  shouldRetry,
  globalRequestQueue,
  PerformanceMetrics,
} from './enhanced-retry-internals';

// Barrel re-export for consumer access
export { PerformanceMetrics } from './enhanced-retry-internals';

// 향상된 재시도 옵션
interface EnhancedRetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
  timeout: number;
  jitter: boolean;
  retryCondition?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

// 기본 설정
const DEFAULT_ENHANCED_OPTIONS: EnhancedRetryOptions = {
  maxRetries: 3,
  initialDelay: 500,
  maxDelay: 5000,
  factor: 2,
  timeout: 10000,
  jitter: true,
};

/**
 * 향상된 재시도 메커니즘과 회로 차단기가 적용된 함수 래퍼
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic wrapper requires any for function constraint
export function withEnhancedRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<EnhancedRetryOptions> = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const retryOptions = { ...DEFAULT_ENHANCED_OPTIONS, ...options };

  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return globalCircuitBreaker.execute(async () => {
      let lastError: unknown;
      let delay = retryOptions.initialDelay;

      for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
        try {
          // 타임아웃과 함께 함수 실행
          const timeoutFn = withTimeout(fn, retryOptions.timeout);
          return await timeoutFn(...args);
        } catch (error) {
          lastError = error;

          // 마지막 시도이거나 재시도하지 않을 조건이면 에러 던지기
          if (attempt === retryOptions.maxRetries || !shouldRetry(error, retryOptions.retryCondition)) {
            throw error;
          }

          // 재시도 콜백 호출
          if (retryOptions.onRetry) {
            retryOptions.onRetry(error, attempt + 1);
          }

          // 지연 후 재시도
          const actualDelay = calculateDelayWithJitter(delay, retryOptions.jitter);
          console.log(`API 요청 재시도 중... (${attempt + 1}/${retryOptions.maxRetries}) - ${actualDelay}ms 대기`);

          await new Promise(resolve => setTimeout(resolve, actualDelay));
          delay = Math.min(delay * retryOptions.factor, retryOptions.maxDelay);
        }
      }

      throw lastError;
    });
  };
}

/**
 * 프로필 조회 전용 최적화된 함수
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic wrapper requires any for function constraint
export function withProfileOptimization<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return withEnhancedRetry(fn, {
    maxRetries: 2,
    initialDelay: 300,
    maxDelay: 2000,
    factor: 1.5,
    timeout: 8000, // AuthProvider의 5초보다 여유있게
    jitter: true,
    retryCondition: (error) => {
      // 프로필 조회 특화 재시도 조건
      const err = error as Record<string, unknown> | null | undefined;
      if (typeof err?.message === 'string' && err.message.includes('프로필 조회 타임아웃')) return true;
      if (err?.code === 'PGRST301') return true; // DB 연결 실패
      if (err?.code === 'ENOTFOUND') return true; // 네트워크 오류
      return shouldRetry(error);
    },
    onRetry: (error, attempt) => {
      console.log(`프로필 조회 재시도 (${attempt}회):`, error instanceof Error ? error.message : error);
    }
  });
}

/**
 * 투표 API 전용 최적화된 함수
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic wrapper requires any for function constraint
export function withVoteOptimization<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return withEnhancedRetry(fn, {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 8000,
    factor: 2,
    timeout: 15000,
    jitter: true,
    retryCondition: (error) => {
      // 투표 관련 특화 재시도 조건
      const err = error as Record<string, unknown> | null | undefined;
      if (typeof err?.status === 'number' && err.status === 409) return false; // 중복 투표는 재시도 안함
      if (typeof err?.message === 'string' && err.message.includes('이미 투표')) return false;
      return shouldRetry(error);
    },
    onRetry: (error, attempt) => {
      console.log(`투표 요청 재시도 (${attempt}회):`, error instanceof Error ? error.message : error);
    }
  });
}

/**
 * 회로 차단기 상태 조회
 */
export function getCircuitBreakerStats() {
  return globalCircuitBreaker.getStats();
}

/**
 * 요청 큐잉이 적용된 함수 래퍼
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic wrapper requires any for function constraint
export function withRequestQueue<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return globalRequestQueue.add(() => fn(...args));
  };
}

/**
 * 성능 모니터링이 적용된 함수 래퍼
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic wrapper requires any for function constraint
export function withPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  metricKey: string
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = Date.now();

    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      PerformanceMetrics.recordRequestTime(metricKey, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      PerformanceMetrics.recordRequestTime(`${metricKey}_error`, duration);
      throw error;
    }
  };
}
