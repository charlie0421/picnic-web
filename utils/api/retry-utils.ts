/**
 * API 요청 실패 시 재시도 기능 구현
 */

// 재시도 옵션 타입 정의
interface RetryOptions {
  maxRetries: number;       // 최대 재시도 횟수
  initialDelay: number;     // 첫 번째 재시도 전 지연 시간(ms)
  maxDelay: number;         // 최대 지연 시간(ms)
  factor: number;           // 지수 백오프 계수
  onRetry?: (error: any, attempt: number) => void;  // 재시도 시 콜백
  shouldRetry?: (error: any) => boolean;  // false 면 남은 횟수와 관계없이 바로 끝낸다 (예: 끊은 요청)
}

// 기본 재시도 옵션
const defaultOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 300,
  maxDelay: 3000,
  factor: 2,
};

/**
 * API 함수를 재시도 메커니즘으로 감싸는 함수
 * @param fn 원본 API 함수
 * @param options 재시도 옵션
 * @returns 재시도 메커니즘이 적용된 함수
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  const retryOptions = { ...defaultOptions, ...options };

  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    let lastError: any;
    let delay = retryOptions.initialDelay;

    for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        // 첫 시도이거나 마지막 시도가 아니면 로그를 남기지 않음
        const isRetry = attempt > 0;

        if (isRetry) {
          console.log(`API 요청 재시도 중... (${attempt}/${retryOptions.maxRetries})`);
        }

        // API 함수 호출
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (retryOptions.shouldRetry && !retryOptions.shouldRetry(error)) {
          throw error;
        }

        if (attempt < retryOptions.maxRetries) {
          // 재시도 콜백 호출
          if (retryOptions.onRetry) {
            retryOptions.onRetry(error, attempt + 1);
          }

          // 지수 백오프 지연
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * retryOptions.factor, retryOptions.maxDelay);

          // 기다리는 동안 중단 조건이 생겼을 수 있다(예: 시간 예산 초과). 다음 시도 전에 다시 확인한다.
          if (retryOptions.shouldRetry && !retryOptions.shouldRetry(error)) {
            throw error;
          }
        }
      }
    }

    // 모든 재시도 실패 시 마지막 오류 throw
    console.error(`모든 재시도 실패 (${retryOptions.maxRetries}회):`, lastError);
    throw lastError;
  };
}

/**
 * API 요청에 타임아웃을 추가하는 함수
 * @param fn 원본 API 함수
 * @param timeoutMs 타임아웃 시간(ms)
 * @returns 타임아웃이 적용된 함수
 */
export function withTimeout<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  timeoutMs: number = 10000
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return Promise.race([
      fn(...args),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`API 요청 타임아웃 (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]) as Promise<ReturnType<T>>;
  };
} 