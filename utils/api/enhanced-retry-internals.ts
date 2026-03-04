/**
 * 향상된 API 재시도 내부 구현
 * - 회로 차단기 패턴
 * - 요청 큐잉
 * - 성능 메트릭
 * - 재시도 유틸리티 함수
 */

// 회로 차단기 상태
export enum CircuitState {
  CLOSED = 'CLOSED',     // 정상 상태
  OPEN = 'OPEN',         // 차단 상태 (요청 거부)
  HALF_OPEN = 'HALF_OPEN' // 반열림 상태 (테스트 요청 허용)
}

// 회로 차단기 옵션
export interface CircuitBreakerOptions {
  failureThreshold: number;    // 실패 임계값
  recoveryTimeout: number;     // 복구 타임아웃
  monitoringWindow: number;    // 모니터링 윈도우
}

export const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  monitoringWindow: 60000,
};

// 회로 차단기 상태 관리
export class CircuitBreaker {
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
export const globalCircuitBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_OPTIONS);

/**
 * 지터를 포함한 지연 계산
 */
export function calculateDelayWithJitter(baseDelay: number, jitter: boolean): number {
  if (!jitter) return baseDelay;

  // ±25% 지터 추가
  const jitterRange = baseDelay * 0.25;
  const jitterAmount = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(100, baseDelay + jitterAmount);
}

/**
 * 재시도 조건 확인
 */
export function shouldRetry(error: unknown, retryCondition?: (error: unknown) => boolean): boolean {
  if (retryCondition) {
    return retryCondition(error);
  }

  // 기본 재시도 조건
  const err = error as Record<string, unknown> | null | undefined;
  if (err?.name === 'AbortError') return false;
  if (err?.code === 'AUTH_ERROR') return false;
  if (typeof err?.status === 'number') {
    if (err.status === 401 || err.status === 403) return false;
    if (err.status >= 400 && err.status < 500) return false;
  }

  return true;
}

/**
 * 요청 큐 관리 클래스
 */
export class RequestQueue {
  private queue: Array<() => Promise<unknown>> = [];
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
export const globalRequestQueue = new RequestQueue();

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
