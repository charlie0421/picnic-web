/**
 * 향상된 API 요청 실패 시 재시도 및 성능 최적화 기능
 * - 타임아웃 관리
 * - 지능형 재시도
 * - 회로 차단기 패턴
 * - 요청 큐잉
 */

import { withRetry, withTimeout } from './retry-utils';

// 회로 차단기 상태
enum CircuitState {
  CLOSED = 'CLOSED',     // 정상 상태
  OPEN = 'OPEN',         // 차단 상태 (요청 거부)
  HALF_OPEN = 'HALF_OPEN' // 반열림 상태 (테스트 요청 허용)
}

// 향상된 재시도 옵션
interface EnhancedRetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
  timeout: number;
  jitter: boolean;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

// 회로 차단기 옵션
interface CircuitBreakerOptions {
  failureThreshold: number;    // 실패 임계값
  recoveryTimeout: number;     // 복구 타임아웃
  monitoringWindow: number;    // 모니터링 윈도우
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

const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  monitoringWindow: 60000,
};

// 회로 차단기 상태 관리
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  
  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('회로 차단기가 열려있습니다. 요청이 차단되었습니다.');
      }
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
      console.warn(`회로 차단기 열림: ${this.options.recoveryTimeout}ms 후 재시도`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}

// 전역 회로 차단기 인스턴스
const globalCircuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_OPTIONS);

/**
 * 지터를 포함한 지연 계산
 */
function calculateDelayWithJitter(baseDelay: number, jitter: boolean): number {
  if (!jitter) return baseDelay;
  
  // ±25% 지터 추가
  const jitterRange = baseDelay * 0.25;
  const jitterAmount = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(100, baseDelay + jitterAmount);
}

/**
 * 재시도 조건 확인
 */
function shouldRetry(error: any, retryCondition?: (error: any) => boolean): boolean {
  if (retryCondition) {
    return retryCondition(error);
  }

  // 기본 재시도 조건
  if (error?.name === 'AbortError') return false;
  if (error?.code === 'AUTH_ERROR') return false;
  if (error?.status === 401 || error?.status === 403) return false;
  if (error?.status >= 400 && error?.status < 500) return false;
  
  return true;
}

/**
 * 향상된 재시도 메커니즘과 회로 차단기가 적용된 함수 래퍼
 */
export function withEnhancedRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<EnhancedRetryOptions> = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const retryOptions = { ...DEFAULT_ENHANCED_OPTIONS, ...options };

  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return globalCircuitBreaker.execute(async () => {
      let lastError: any;
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
      if (error?.message?.includes('프로필 조회 타임아웃')) return true;
      if (error?.code === 'PGRST301') return true; // DB 연결 실패
      if (error?.code === 'ENOTFOUND') return true; // 네트워크 오류
      return shouldRetry(error);
    },
    onRetry: (error, attempt) => {
      console.log(`프로필 조회 재시도 (${attempt}회):`, error.message);
    }
  });
}

/**
 * 투표 API 전용 최적화된 함수
 */
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
      if (error?.status === 409) return false; // 중복 투표는 재시도 안함
      if (error?.message?.includes('이미 투표')) return false;
      return shouldRetry(error);
    },
    onRetry: (error, attempt) => {
      console.log(`투표 요청 재시도 (${attempt}회):`, error.message);
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
 * 요청 큐 관리 클래스
 */
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private maxConcurrent = 3;
  private currentCount = 0;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.currentCount >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.currentCount < this.maxConcurrent) {
      const fn = this.queue.shift();
      if (fn) {
        this.currentCount++;
        fn().finally(() => {
          this.currentCount--;
          this.process();
        });
      }
    }

    this.processing = false;
  }
}

// 전역 요청 큐
const globalRequestQueue = new RequestQueue();

/**
 * 요청 큐잉이 적용된 함수 래퍼
 */
export function withRequestQueue<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return globalRequestQueue.add(() => fn(...args));
  };
}

/**
 * 성능 모니터링을 위한 메트릭 수집
 */
export class PerformanceMetrics {
  private static metrics: Map<string, number[]> = new Map();

  static recordRequestTime(key: string, duration: number): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const times = this.metrics.get(key)!;
    times.push(duration);
    
    // 최근 100개만 유지
    if (times.length > 100) {
      times.shift();
    }
  }

  static getAverageTime(key: string): number {
    const times = this.metrics.get(key);
    if (!times || times.length === 0) return 0;
    
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  static getMetrics(): Record<string, { avg: number; count: number }> {
    const result: Record<string, { avg: number; count: number }> = {};
    
    for (const [key, times] of Array.from(this.metrics.entries())) {
      result[key] = {
        avg: this.getAverageTime(key),
        count: times.length
      };
    }
    
    return result;
  }

  static clear(): void {
    this.metrics.clear();
  }
}

/**
 * 성능 모니터링이 적용된 함수 래퍼
 */
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