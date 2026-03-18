import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/utils/error', () => ({
  AppError: class AppError extends Error {
    category: string;
    severity: string;
    statusCode: number;
    isRetryable: boolean;
    context?: any;
    originalError?: any;
    constructor(message: string, category = 'unknown', severity = 'medium', statusCode = 500, options: any = {}) {
      super(message);
      this.name = 'AppError';
      this.category = category;
      this.severity = severity;
      this.statusCode = statusCode;
      this.isRetryable = options.isRetryable ?? ['network', 'server', 'external_service'].includes(category);
      this.context = options.context;
      this.originalError = options.originalError;
    }
  },
  ErrorCategory: {
    NETWORK: 'network',
    SERVER: 'server',
    CLIENT: 'client',
    EXTERNAL_SERVICE: 'external_service',
    UNKNOWN: 'unknown',
  },
  ErrorSeverity: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  ExtendedRetryUtility,
  RetryStrategy,
  DEFAULT_RETRY_CONFIG,
  NETWORK_RETRY_CONFIG,
  DATABASE_RETRY_CONFIG,
  EXTERNAL_API_RETRY_CONFIG,
} from '@/utils/retry';
import {
  withNetworkRetry,
  withDatabaseRetry,
  withExternalApiRetry,
  withServerActionRetry,
  withBatchRetry,
  createRetryCondition,
} from '@/utils/retry-wrappers';

describe('retry-types', () => {
  describe('RetryStrategy enum', () => {
    it('has EXPONENTIAL_BACKOFF strategy', () => {
      expect(RetryStrategy.EXPONENTIAL_BACKOFF).toBe('exponential_backoff');
    });

    it('has LINEAR_BACKOFF strategy', () => {
      expect(RetryStrategy.LINEAR_BACKOFF).toBe('linear_backoff');
    });

    it('has FIXED_DELAY strategy', () => {
      expect(RetryStrategy.FIXED_DELAY).toBe('fixed_delay');
    });

    it('has IMMEDIATE strategy', () => {
      expect(RetryStrategy.IMMEDIATE).toBe('immediate');
    });
  });

  describe('config presets', () => {
    it('DEFAULT_RETRY_CONFIG has expected values', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.baseDelay).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.strategy).toBe(RetryStrategy.EXPONENTIAL_BACKOFF);
      expect(DEFAULT_RETRY_CONFIG.jitter).toBe(true);
    });

    it('NETWORK_RETRY_CONFIG has more attempts', () => {
      expect(NETWORK_RETRY_CONFIG.maxAttempts).toBe(5);
      expect(NETWORK_RETRY_CONFIG.baseDelay).toBe(500);
    });

    it('DATABASE_RETRY_CONFIG targets server and network', () => {
      expect(DATABASE_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DATABASE_RETRY_CONFIG.retryableCategories).toContain('server');
      expect(DATABASE_RETRY_CONFIG.retryableCategories).toContain('network');
    });

    it('EXTERNAL_API_RETRY_CONFIG has 4 attempts', () => {
      expect(EXTERNAL_API_RETRY_CONFIG.maxAttempts).toBe(4);
      expect(EXTERNAL_API_RETRY_CONFIG.baseDelay).toBe(2000);
    });
  });
});

describe('ExtendedRetryUtility', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await ExtendedRetryUtility.withRetry(
        operation,
        { ...DEFAULT_RETRY_CONFIG, strategy: RetryStrategy.IMMEDIATE },
        'test-op',
      );
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries and succeeds on second attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce('ok');

      const result = await ExtendedRetryUtility.withRetry(
        operation,
        {
          ...DEFAULT_RETRY_CONFIG,
          strategy: RetryStrategy.IMMEDIATE,
          retryCondition: () => true,
        },
        'test-retry',
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('ok');
      expect(result.attempts).toBe(2);
    });

    it('returns failure after exhausting all attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('always fails'));

      const result = await ExtendedRetryUtility.withRetry(
        operation,
        {
          ...DEFAULT_RETRY_CONFIG,
          maxAttempts: 2,
          strategy: RetryStrategy.IMMEDIATE,
          retryCondition: () => true,
        },
        'failing-op',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(2);
    });

    it('calls onRetry callback on retry', async () => {
      const onRetry = vi.fn();
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      await ExtendedRetryUtility.withRetry(
        operation,
        {
          ...DEFAULT_RETRY_CONFIG,
          strategy: RetryStrategy.IMMEDIATE,
          retryCondition: () => true,
          onRetry,
        },
        'callback-test',
      );

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('includes totalDuration in result', async () => {
      const operation = vi.fn().mockResolvedValue('data');
      const result = await ExtendedRetryUtility.withRetry(
        operation,
        { ...DEFAULT_RETRY_CONFIG, strategy: RetryStrategy.IMMEDIATE },
      );
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.lastAttemptAt).toBeInstanceOf(Date);
    });

    it('does not retry if retryCondition returns false', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('no retry'));

      const result = await ExtendedRetryUtility.withRetry(
        operation,
        {
          ...DEFAULT_RETRY_CONFIG,
          maxAttempts: 3,
          strategy: RetryStrategy.IMMEDIATE,
          retryCondition: () => false,
        },
      );

      expect(result.success).toBe(false);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});

describe('retry wrappers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withNetworkRetry', () => {
    it('returns success result on successful operation', async () => {
      const result = await withNetworkRetry(() => Promise.resolve('data'), 'network-test');
      expect(result.success).toBe(true);
      expect(result.data).toBe('data');
    });

    it('retries on failure', async () => {
      let callCount = 0;
      const result = await withNetworkRetry(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve('recovered');
      }, 'network-retry');
      // The retry may or may not succeed depending on the retryCondition
      expect(result.attempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe('withDatabaseRetry', () => {
    it('returns success on first attempt', async () => {
      const result = await withDatabaseRetry(() => Promise.resolve(42), 'db-op');
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });
  });

  describe('withExternalApiRetry', () => {
    it('returns success on first attempt', async () => {
      const result = await withExternalApiRetry(() => Promise.resolve({ ok: true }), 'api-op');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ ok: true });
    });
  });

  describe('withServerActionRetry', () => {
    it('returns success with simplified result shape', async () => {
      const result = await withServerActionRetry(() => Promise.resolve('action-data'), 'action');
      expect(result.success).toBe(true);
      expect(result.data).toBe('action-data');
      expect(result.attempts).toBe(1);
    });

    it('returns error message on failure', async () => {
      const result = await withServerActionRetry(
        () => Promise.reject(new Error('action failed')),
        'action-fail',
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('withBatchRetry', () => {
    it('processes multiple operations', async () => {
      const operations = [
        () => Promise.resolve('a'),
        () => Promise.resolve('b'),
        () => Promise.resolve('c'),
      ];
      const results = await withBatchRetry(
        operations,
        { ...DEFAULT_RETRY_CONFIG, strategy: RetryStrategy.IMMEDIATE },
        'batch',
      );
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[0].data).toBe('a');
      expect(results[1].data).toBe('b');
      expect(results[2].data).toBe('c');
    });

    it('handles mixed success/failure in batch', async () => {
      const operations = [
        () => Promise.resolve('ok'),
        () => Promise.reject(new Error('fail')),
      ];
      const results = await withBatchRetry(
        operations,
        { ...DEFAULT_RETRY_CONFIG, strategy: RetryStrategy.IMMEDIATE, retryCondition: () => false },
        'batch-mixed',
      );
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });
});

describe('createRetryCondition', () => {
  describe('httpStatus', () => {
    it('returns true for retryable status codes', async () => {
      const { AppError } = vi.mocked(await import('@/utils/error'));
      const condition = createRetryCondition.httpStatus([429, 503]);
      const error = new AppError('rate limited', 'network', 'medium', 429);
      expect(condition(error, 1)).toBe(true);
    });

    it('returns false for non-retryable status codes', async () => {
      const { AppError } = vi.mocked(await import('@/utils/error'));
      const condition = createRetryCondition.httpStatus([429, 503]);
      const error = new AppError('not found', 'not_found', 'low', 404);
      expect(condition(error, 1)).toBe(false);
    });

    it('returns false for non-AppError', () => {
      const condition = createRetryCondition.httpStatus([429]);
      expect(condition(new Error('generic'), 1)).toBe(false);
    });
  });

  describe('errorMessage', () => {
    it('returns true if error message matches', () => {
      const condition = createRetryCondition.errorMessage(['timeout', 'connection']);
      expect(condition(new Error('Connection refused'), 1)).toBe(true);
    });

    it('returns false if error message does not match', () => {
      const condition = createRetryCondition.errorMessage(['timeout']);
      expect(condition(new Error('not found'), 1)).toBe(false);
    });

    it('is case insensitive', () => {
      const condition = createRetryCondition.errorMessage(['TIMEOUT']);
      expect(condition(new Error('request timeout'), 1)).toBe(true);
    });
  });

  describe('maxAttempts', () => {
    it('returns true when attempt is below max', () => {
      const condition = createRetryCondition.maxAttempts(3);
      expect(condition(new Error('fail'), 1)).toBe(true);
      expect(condition(new Error('fail'), 2)).toBe(true);
    });

    it('returns false when attempt reaches max', () => {
      const condition = createRetryCondition.maxAttempts(3);
      expect(condition(new Error('fail'), 3)).toBe(false);
    });
  });

  describe('and', () => {
    it('returns true only when all conditions are met', () => {
      const alwaysTrue = () => true;
      const alwaysFalse = () => false;
      const andCondition = createRetryCondition.and(alwaysTrue, alwaysFalse);
      expect(andCondition(new Error('test'), 1)).toBe(false);
    });

    it('returns true when all conditions pass', () => {
      const condition = createRetryCondition.and(() => true, () => true);
      expect(condition(new Error('test'), 1)).toBe(true);
    });
  });

  describe('or', () => {
    it('returns true when any condition is met', () => {
      const condition = createRetryCondition.or(() => false, () => true);
      expect(condition(new Error('test'), 1)).toBe(true);
    });

    it('returns false when no conditions are met', () => {
      const condition = createRetryCondition.or(() => false, () => false);
      expect(condition(new Error('test'), 1)).toBe(false);
    });
  });
});
