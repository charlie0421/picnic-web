/**
 * 확장된 재시도 로직 유틸리티
 *
 * 다양한 시나리오에 대한 재시도 메커니즘을 제공합니다.
 *
 * 이 파일은 배럴 모듈로, 세 개의 하위 모듈에서 모든 공개 API를 재내보냅니다:
 * - retry-types: 타입, 인터페이스, 프리셋 설정
 * - retry-core: ExtendedRetryUtility 클래스
 * - retry-wrappers: 래퍼 함수, 조건 팩토리, 데코레이터, React Hook
 */

// 타입, 인터페이스, 프리셋 설정
export {
  DATABASE_RETRY_CONFIG,
  DEFAULT_RETRY_CONFIG,
  EXTERNAL_API_RETRY_CONFIG,
  NETWORK_RETRY_CONFIG,
  RetryStrategy,
} from './retry-types';
export type {
  ExtendedRetryConfig,
  RetryCondition,
  RetryResult,
} from './retry-types';

// 코어 재시도 유틸리티 클래스
export { ExtendedRetryUtility } from './retry-core';

// 래퍼 함수, 조건 팩토리, 데코레이터, React Hook
export {
  createRetryCondition,
  useRetryableOperation,
  withAutoRetry,
  withBatchRetry,
  withDatabaseRetry,
  withExternalApiRetry,
  withNetworkRetry,
  withServerActionRetry,
} from './retry-wrappers';
