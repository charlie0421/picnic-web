/**
 * 확장된 재시도 유틸리티 코어 클래스
 *
 * 재시도 로직의 핵심 구현을 담당합니다.
 */

import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { logger } from '@/utils/logger';
import { DEFAULT_RETRY_CONFIG, ExtendedRetryConfig, RetryResult, RetryStrategy } from './retry-types';

/**
 * 확장된 재시도 유틸리티 클래스
 */
export class ExtendedRetryUtility {
  /**
   * 재시도 로직과 함께 작업 실행
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<ExtendedRetryConfig> = {},
    operationName?: string
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | AppError;
    let attempts = 0;

    // 타임아웃 설정
    const timeoutPromise = finalConfig.timeoutMs
      ? new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new AppError(
              `작업 타임아웃: ${finalConfig.timeoutMs}ms 초과`,
              ErrorCategory.CLIENT,
              ErrorSeverity.MEDIUM,
              408
            ));
          }, finalConfig.timeoutMs);
        })
      : null;

    while (attempts < finalConfig.maxAttempts) {
      attempts++;

      try {
        // 타임아웃이 설정된 경우 Promise.race 사용
        const result = timeoutPromise
          ? await Promise.race([operation(), timeoutPromise])
          : await operation();

        // 성공 로깅
        if (attempts > 1) {
          await logger.info(`재시도 성공: ${operationName || 'unknown'}`, {
            attempts,
            totalDuration: Date.now() - startTime,
            operationName,
          });
        }

        return {
          success: true,
          data: result,
          attempts,
          totalDuration: Date.now() - startTime,
          lastAttemptAt: new Date(),
        };

      } catch (error) {
        lastError = error instanceof AppError ? error : new AppError(
          error instanceof Error ? error.message : String(error),
          ErrorCategory.UNKNOWN,
          ErrorSeverity.MEDIUM,
          500,
          { originalError: error }
        );

        // 재시도 조건 확인
        const shouldRetry = this.shouldRetry(lastError, attempts, finalConfig);

        if (!shouldRetry || attempts >= finalConfig.maxAttempts) {
          // 최종 실패 로깅
          await logger.error(`재시도 최종 실패: ${operationName || 'unknown'}`, lastError, {
            attempts,
            totalDuration: Date.now() - startTime,
            operationName,
            maxAttempts: finalConfig.maxAttempts,
          });

          return {
            success: false,
            error: lastError,
            attempts,
            totalDuration: Date.now() - startTime,
            lastAttemptAt: new Date(),
          };
        }

        // 재시도 콜백 실행
        if (finalConfig.onRetry) {
          try {
            await finalConfig.onRetry(lastError, attempts);
          } catch (callbackError) {
            await logger.warn('재시도 콜백 실행 실패', {
              operationName,
              attempt: attempts,
              error: callbackError,
            });
          }
        }

        // 재시도 로깅
        await logger.warn(`재시도 시도 ${attempts}/${finalConfig.maxAttempts}: ${operationName || 'unknown'}`, {
          attempt: attempts,
          maxAttempts: finalConfig.maxAttempts,
          operationName,
          nextDelayMs: this.calculateDelay(attempts, finalConfig),
          error: lastError,
        });

        // 마지막 시도가 아니면 지연
        if (attempts < finalConfig.maxAttempts) {
          const delay = this.calculateDelay(attempts, finalConfig);
          await this.sleep(delay);
        }
      }
    }

    // 이 지점에 도달하면 안 되지만, 안전장치
    return {
      success: false,
      error: lastError!,
      attempts,
      totalDuration: Date.now() - startTime,
      lastAttemptAt: new Date(),
    };
  }

  /**
   * 재시도 여부 결정
   */
  private static shouldRetry(
    error: Error | AppError,
    attempt: number,
    config: ExtendedRetryConfig
  ): boolean {
    // 커스텀 재시도 조건이 있으면 우선 적용
    if (config.retryCondition) {
      return config.retryCondition(error, attempt);
    }

    // AppError인 경우 재시도 가능 여부 확인
    if (error instanceof AppError) {
      return error.isRetryable && config.retryableCategories.includes(error.category);
    }

    // 일반 Error인 경우 네트워크 에러로 간주하여 재시도
    return config.retryableCategories.includes(ErrorCategory.NETWORK);
  }

  /**
   * 지연 시간 계산
   */
  private static calculateDelay(attempt: number, config: ExtendedRetryConfig): number {
    let delay: number;

    switch (config.strategy) {
      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        break;

      case RetryStrategy.LINEAR_BACKOFF:
        delay = Math.min(
          config.baseDelay * attempt,
          config.maxDelay
        );
        break;

      case RetryStrategy.FIXED_DELAY:
        delay = config.baseDelay;
        break;

      case RetryStrategy.IMMEDIATE:
        delay = 0;
        break;

      default:
        delay = config.baseDelay;
    }

    // 지터 추가 (랜덤 요소로 동시 재시도 방지)
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% 지터
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }

    return Math.max(0, Math.floor(delay));
  }

  /**
   * 지연 함수
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
