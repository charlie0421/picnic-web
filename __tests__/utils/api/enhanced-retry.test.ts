import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock retry-utils (withTimeout used by enhanced-retry-utils)
vi.mock('@/utils/api/retry-utils', () => ({
  withTimeout: vi.fn((fn: any, _timeout: number) => {
    // Return a wrapper that just calls the original function (no actual timeout)
    return (...args: any[]) => fn(...args);
  }),
}));

vi.mock('@/config/settings', () => ({
  DEFAULT_LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: ['en', 'ko', 'ja'],
  settings: {
    languages: {
      supported: ['en', 'ko', 'ja'],
      default: 'en',
    },
  },
}));

import {
  CircuitState,
  CircuitBreaker,
  DEFAULT_CIRCUIT_OPTIONS,
  calculateDelayWithJitter,
  shouldRetry,
  RequestQueue,
  PerformanceMetrics,
  globalCircuitBreaker,
  globalRequestQueue,
} from '@/utils/api/enhanced-retry-internals';

import {
  withEnhancedRetry,
  withProfileOptimization,
  withVoteOptimization,
  getCircuitBreakerStats,
  withRequestQueue,
  withPerformanceMonitoring,
} from '@/utils/api/enhanced-retry-utils';

// ---------------------------------------------------------------------------
// enhanced-retry-internals.ts
// ---------------------------------------------------------------------------

describe('enhanced-retry-internals', () => {
  describe('CircuitState', () => {
    it('has CLOSED, OPEN, HALF_OPEN values', () => {
      expect(CircuitState.CLOSED).toBe('CLOSED');
      expect(CircuitState.OPEN).toBe('OPEN');
      expect(CircuitState.HALF_OPEN).toBe('HALF_OPEN');
    });
  });

  describe('DEFAULT_CIRCUIT_OPTIONS', () => {
    it('has correct default values', () => {
      expect(DEFAULT_CIRCUIT_OPTIONS.failureThreshold).toBe(5);
      expect(DEFAULT_CIRCUIT_OPTIONS.recoveryTimeout).toBe(30000);
      expect(DEFAULT_CIRCUIT_OPTIONS.monitoringWindow).toBe(60000);
    });
  });

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000,
        monitoringWindow: 5000,
      });
    });

    it('starts in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('getStats returns initial stats', () => {
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.lastFailureTime).toBe(0);
      expect(stats.nextAttemptTime).toBe(0);
    });

    it('execute succeeds and stays CLOSED', async () => {
      const result = await breaker.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('execute resets failure count on success', async () => {
      // Cause some failures (below threshold)
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch {}
      try { await breaker.execute(() => Promise.reject(new Error('fail'))); } catch {}

      expect(breaker.getStats().failureCount).toBe(2);

      await breaker.execute(() => Promise.resolve('ok'));
      expect(breaker.getStats().failureCount).toBe(0);
    });

    it('transitions to OPEN after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('rejects immediately when OPEN and before nextAttemptTime', async () => {
      // Force OPEN
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      await expect(
        breaker.execute(() => Promise.resolve('should not run'))
      ).rejects.toThrow('회로 차단기가 열려있습니다');
    });

    it('transitions to HALF_OPEN when recovery timeout has passed', async () => {
      const shortBreaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 10, // very short
        monitoringWindow: 5000,
      });

      try {
        await shortBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(shortBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for recovery timeout
      await new Promise(r => setTimeout(r, 20));

      // Should move to HALF_OPEN and execute
      const result = await shortBreaker.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(shortBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('HALF_OPEN failure re-opens the circuit', async () => {
      const shortBreaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 10,
        monitoringWindow: 5000,
      });

      // Open it
      try {
        await shortBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      expect(shortBreaker.getState()).toBe(CircuitState.OPEN);

      await new Promise(r => setTimeout(r, 20));

      // HALF_OPEN then fail again
      try {
        await shortBreaker.execute(() => Promise.reject(new Error('fail again')));
      } catch {}

      expect(shortBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('logs warning when circuit opens', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('회로 차단기 열림'));
      warnSpy.mockRestore();
    });
  });

  describe('calculateDelayWithJitter', () => {
    it('returns baseDelay when jitter is false', () => {
      expect(calculateDelayWithJitter(1000, false)).toBe(1000);
    });

    it('returns a value within ±25% range when jitter is true', () => {
      const baseDelay = 1000;
      for (let i = 0; i < 50; i++) {
        const result = calculateDelayWithJitter(baseDelay, true);
        expect(result).toBeGreaterThanOrEqual(100); // Math.max(100, ...)
        expect(result).toBeLessThanOrEqual(1250); // max 1000 + 250
        expect(result).toBeGreaterThanOrEqual(750 < 100 ? 100 : 750); // min 1000 - 250
      }
    });

    it('enforces minimum of 100ms', () => {
      // With very small baseDelay, jitter can push below 100
      const result = calculateDelayWithJitter(10, true);
      expect(result).toBeGreaterThanOrEqual(100);
    });
  });

  describe('shouldRetry', () => {
    it('uses custom retryCondition when provided', () => {
      const condition = vi.fn().mockReturnValue(false);
      const result = shouldRetry(new Error('test'), condition);
      expect(result).toBe(false);
      expect(condition).toHaveBeenCalledWith(expect.any(Error));
    });

    it('returns false for AbortError', () => {
      expect(shouldRetry({ name: 'AbortError' })).toBe(false);
    });

    it('returns false for AUTH_ERROR', () => {
      expect(shouldRetry({ code: 'AUTH_ERROR' })).toBe(false);
    });

    it('returns false for 401 status', () => {
      expect(shouldRetry({ status: 401 })).toBe(false);
    });

    it('returns false for 403 status', () => {
      expect(shouldRetry({ status: 403 })).toBe(false);
    });

    it('returns false for 4xx client errors', () => {
      expect(shouldRetry({ status: 400 })).toBe(false);
      expect(shouldRetry({ status: 404 })).toBe(false);
      expect(shouldRetry({ status: 422 })).toBe(false);
      expect(shouldRetry({ status: 499 })).toBe(false);
    });

    it('returns true for 5xx server errors', () => {
      expect(shouldRetry({ status: 500 })).toBe(true);
      expect(shouldRetry({ status: 502 })).toBe(true);
      expect(shouldRetry({ status: 503 })).toBe(true);
    });

    it('returns true for network errors (no status)', () => {
      expect(shouldRetry(new Error('network timeout'))).toBe(true);
    });

    it('returns true for null/undefined error', () => {
      expect(shouldRetry(null)).toBe(true);
      expect(shouldRetry(undefined)).toBe(true);
    });
  });

  describe('RequestQueue', () => {
    it('executes added functions', async () => {
      const queue = new RequestQueue();
      const result = await queue.add(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('propagates errors from queued functions', async () => {
      const queue = new RequestQueue();
      await expect(
        queue.add(() => Promise.reject(new Error('queue fail')))
      ).rejects.toThrow('queue fail');
    });

    it('processes multiple items concurrently (up to maxConcurrent=3)', async () => {
      const queue = new RequestQueue();
      const order: number[] = [];

      const results = await Promise.all([
        queue.add(async () => { order.push(1); return 1; }),
        queue.add(async () => { order.push(2); return 2; }),
        queue.add(async () => { order.push(3); return 3; }),
        queue.add(async () => { order.push(4); return 4; }),
      ]);

      expect(results).toEqual([1, 2, 3, 4]);
      expect(order).toHaveLength(4);
    });

    it('handles mixed success and failure', async () => {
      const queue = new RequestQueue();

      const p1 = queue.add(() => Promise.resolve('ok'));
      const p2 = queue.add(() => Promise.reject(new Error('fail')));
      const p3 = queue.add(() => Promise.resolve('ok2'));

      await expect(p1).resolves.toBe('ok');
      await expect(p2).rejects.toThrow('fail');
      await expect(p3).resolves.toBe('ok2');
    });
  });

  describe('PerformanceMetrics', () => {
    beforeEach(() => {
      PerformanceMetrics.clear();
    });

    it('records request time', () => {
      PerformanceMetrics.recordRequestTime('test', 100);
      PerformanceMetrics.recordRequestTime('test', 200);
      expect(PerformanceMetrics.getAverageTime('test')).toBe(150);
    });

    it('returns 0 for unknown key', () => {
      expect(PerformanceMetrics.getAverageTime('nonexistent')).toBe(0);
    });

    it('keeps only the last 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        PerformanceMetrics.recordRequestTime('overflow', i);
      }
      const metrics = PerformanceMetrics.getMetrics();
      expect(metrics['overflow'].count).toBe(100);
    });

    it('getMetrics returns all recorded keys', () => {
      PerformanceMetrics.recordRequestTime('a', 10);
      PerformanceMetrics.recordRequestTime('b', 20);
      const metrics = PerformanceMetrics.getMetrics();
      expect(metrics).toHaveProperty('a');
      expect(metrics).toHaveProperty('b');
      expect(metrics['a']).toEqual({ avg: 10, count: 1 });
      expect(metrics['b']).toEqual({ avg: 20, count: 1 });
    });

    it('clear removes all metrics', () => {
      PerformanceMetrics.recordRequestTime('x', 1);
      PerformanceMetrics.clear();
      expect(PerformanceMetrics.getAverageTime('x')).toBe(0);
      expect(PerformanceMetrics.getMetrics()).toEqual({});
    });
  });

  describe('globalCircuitBreaker', () => {
    it('is an instance of CircuitBreaker', () => {
      expect(globalCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      expect(globalCircuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('globalRequestQueue', () => {
    it('is an instance of RequestQueue', () => {
      expect(globalRequestQueue).toBeInstanceOf(RequestQueue);
    });
  });
});

// ---------------------------------------------------------------------------
// enhanced-retry-utils.ts
// ---------------------------------------------------------------------------

describe('enhanced-retry-utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withEnhancedRetry', () => {
    it('calls the wrapped function and returns its result', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('result');
      const retryFn = withEnhancedRetry(fn, { maxRetries: 0, jitter: false });

      const result = await retryFn();
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds eventually', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockResolvedValue('ok');

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const retryFn = withEnhancedRetry(fn, {
        maxRetries: 2,
        initialDelay: 10,
        maxDelay: 50,
        factor: 2,
        jitter: false,
      });

      const result = await retryFn();
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
      logSpy.mockRestore();
    });

    it('throws after exhausting all retries', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue(new Error('persistent fail'));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const retryFn = withEnhancedRetry(fn, {
        maxRetries: 1,
        initialDelay: 10,
        maxDelay: 20,
        factor: 1,
        jitter: false,
      });

      await expect(retryFn()).rejects.toThrow('persistent fail');
      expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
      logSpy.mockRestore();
    });

    it('does not retry when shouldRetry returns false', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue({ name: 'AbortError' });

      const retryFn = withEnhancedRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        jitter: false,
      });

      await expect(retryFn()).rejects.toEqual({ name: 'AbortError' });
      expect(fn).toHaveBeenCalledTimes(1); // no retries
    });

    it('calls onRetry callback on each retry', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');

      const onRetry = vi.fn();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const retryFn = withEnhancedRetry(fn, {
        maxRetries: 2,
        initialDelay: 10,
        jitter: false,
        onRetry,
      });

      await retryFn();
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
      logSpy.mockRestore();
    });

    it('respects custom retryCondition', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue(new Error('custom'));
      const retryCondition = vi.fn().mockReturnValue(false);

      const retryFn = withEnhancedRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        jitter: false,
        retryCondition,
      });

      await expect(retryFn()).rejects.toThrow('custom');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(retryCondition).toHaveBeenCalled();
    });
  });

  describe('withProfileOptimization', () => {
    it('wraps function with profile-specific retry settings', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue({ id: 1, name: 'test' });
      const optimized = withProfileOptimization(fn);

      const result = await optimized();
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    it('retries on profile timeout error', async () => {
      vi.useRealTimers();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fn = vi.fn()
        .mockRejectedValueOnce({ message: '프로필 조회 타임아웃' })
        .mockResolvedValue({ id: 1 });

      const optimized = withProfileOptimization(fn);
      const result = await optimized();
      expect(result).toEqual({ id: 1 });
      expect(fn).toHaveBeenCalledTimes(2);
      logSpy.mockRestore();
    });

    it('retries on PGRST301 error', async () => {
      vi.useRealTimers();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'PGRST301' })
        .mockResolvedValue({ id: 1 });

      const optimized = withProfileOptimization(fn);
      const result = await optimized();
      expect(result).toEqual({ id: 1 });
      logSpy.mockRestore();
    });

    it('retries on ENOTFOUND error', async () => {
      vi.useRealTimers();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'ENOTFOUND' })
        .mockResolvedValue({ id: 1 });

      const optimized = withProfileOptimization(fn);
      const result = await optimized();
      expect(result).toEqual({ id: 1 });
      logSpy.mockRestore();
    });
  });

  describe('withVoteOptimization', () => {
    it('wraps function with vote-specific retry settings', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue({ success: true });
      const optimized = withVoteOptimization(fn);

      const result = await optimized();
      expect(result).toEqual({ success: true });
    });

    it('does not retry on 409 conflict (duplicate vote)', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue({ status: 409, message: 'conflict' });

      const optimized = withVoteOptimization(fn);
      await expect(optimized()).rejects.toEqual({ status: 409, message: 'conflict' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not retry when message contains "이미 투표"', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue({ message: '이미 투표했습니다' });

      const optimized = withVoteOptimization(fn);
      await expect(optimized()).rejects.toEqual({ message: '이미 투표했습니다' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on server errors', async () => {
      vi.useRealTimers();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500, message: 'server error' })
        .mockResolvedValue({ success: true });

      const optimized = withVoteOptimization(fn);
      const result = await optimized();
      expect(result).toEqual({ success: true });
      expect(fn).toHaveBeenCalledTimes(2);
      logSpy.mockRestore();
    });
  });

  describe('getCircuitBreakerStats', () => {
    it('returns stats from global circuit breaker', () => {
      const stats = getCircuitBreakerStats();
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('lastFailureTime');
      expect(stats).toHaveProperty('nextAttemptTime');
    });
  });

  describe('withRequestQueue', () => {
    it('queues and executes the wrapped function', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('queued');
      const queued = withRequestQueue(fn);

      const result = await queued('arg1', 'arg2');
      expect(result).toBe('queued');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('withPerformanceMonitoring', () => {
    beforeEach(() => {
      vi.useRealTimers();
      PerformanceMetrics.clear();
    });

    it('records successful request time', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const monitored = withPerformanceMonitoring(fn, 'test-metric');

      const result = await monitored();
      expect(result).toBe('ok');

      const metrics = PerformanceMetrics.getMetrics();
      expect(metrics).toHaveProperty('test-metric');
      expect(metrics['test-metric'].count).toBe(1);
    });

    it('records error request time with _error suffix', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      const monitored = withPerformanceMonitoring(fn, 'test-metric');

      await expect(monitored()).rejects.toThrow('fail');

      const metrics = PerformanceMetrics.getMetrics();
      expect(metrics).toHaveProperty('test-metric_error');
      expect(metrics['test-metric_error'].count).toBe(1);
    });
  });
});
