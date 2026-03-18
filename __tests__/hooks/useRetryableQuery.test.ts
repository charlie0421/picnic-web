import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks ---

vi.mock('@/utils/retry', () => ({
  ExtendedRetryUtility: {
    withRetry: vi.fn(),
  },
  NETWORK_RETRY_CONFIG: {
    maxAttempts: 3,
    baseDelay: 1000,
  },
  createRetryCondition: {
    or: vi.fn(() => () => true),
    and: vi.fn(() => () => true),
    httpStatus: vi.fn(() => () => true),
    errorMessage: vi.fn(() => () => true),
    maxAttempts: vi.fn(() => () => true),
  },
}));

vi.mock('@/utils/error', () => {
  class AppError extends Error {
    category: string;
    severity: string;
    statusCode: number;
    context: any;
    constructor(message: string, category?: string, severity?: string, statusCode?: number, context?: any) {
      super(message);
      this.name = 'AppError';
      this.category = category || 'UNKNOWN';
      this.severity = severity || 'MEDIUM';
      this.statusCode = statusCode || 500;
      this.context = context;
    }
  }
  return {
    AppError,
    ErrorCategory: {
      NETWORK: 'NETWORK',
      SERVER: 'SERVER',
      EXTERNAL_SERVICE: 'EXTERNAL_SERVICE',
      DATA_FETCHING: 'DATA_FETCHING',
      UNKNOWN: 'UNKNOWN',
    },
    ErrorSeverity: {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      CRITICAL: 'CRITICAL',
    },
  };
});

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/contexts/ErrorContext', () => {
  const fn = vi.fn();
  const stable = { handleError: fn };
  return {
    useErrorHandler: () => stable,
  };
});

// --- Import after mocks ---

import { ExtendedRetryUtility } from '@/utils/retry';
import { useRetryableQuery, useRetryableMutation } from '@/hooks/useRetryableQuery';
import { useMutation } from '@/hooks/retryable-query-types';
import { useErrorHandler } from '@/contexts/ErrorContext';

const mockWithRetry = vi.mocked(ExtendedRetryUtility.withRetry);
const getHandleError = () => (useErrorHandler() as any).handleError;

// Stable query functions to avoid infinite re-renders from useCallback deps
const stableSuccessQueryFn = vi.fn().mockResolvedValue('result-data');
const stableFailQueryFn = vi.fn().mockRejectedValue(new Error('Failed'));

describe('useRetryableQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockReset();
    stableSuccessQueryFn.mockClear();
    stableFailQueryFn.mockClear();
  });

  it('should not execute when disabled', () => {
    renderHook(() =>
      useRetryableQuery(['disabled-test'], stableSuccessQueryFn, { enabled: false })
    );
    expect(mockWithRetry).not.toHaveBeenCalled();
  });

  it('should use fallbackData when provided', () => {
    mockWithRetry.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useRetryableQuery(['fallback-test'], stableSuccessQueryFn, {
        fallbackData: 'fallback' as any,
      })
    );
    expect(result.current.data).toBe('fallback');
  });

  it('should start loading when enabled', () => {
    mockWithRetry.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useRetryableQuery(['loading-test'], stableSuccessQueryFn)
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('should call withRetry when enabled', async () => {
    mockWithRetry.mockImplementation(() => new Promise(() => {})); // never resolves
    renderHook(() =>
      useRetryableQuery(['call-test'], stableSuccessQueryFn)
    );
    expect(mockWithRetry).toHaveBeenCalled();
  });

  it('should call onSuccess callback', async () => {
    mockWithRetry.mockResolvedValue({ success: true, data: 'cb-data' } as any);
    const onSuccess = vi.fn();

    renderHook(() =>
      useRetryableQuery(['success-cb-test'], stableSuccessQueryFn, { onSuccess })
    );

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('cb-data');
    });
  });

  it('should pass operationName to withRetry', () => {
    mockWithRetry.mockImplementation(() => new Promise(() => {}));
    renderHook(() =>
      useRetryableQuery(['op-test'], stableFailQueryFn, { operationName: 'myOp' })
    );
    expect(mockWithRetry).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
      'myOp'
    );
  });

  it('should call onError callback on failed query', async () => {
    const error = new Error('Failed');
    mockWithRetry.mockResolvedValue({ success: false, error, attempts: 2 } as any);
    const onError = vi.fn();

    renderHook(() =>
      useRetryableQuery(['error-cb-test'], stableFailQueryFn, { onError })
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });

  it('should propagate error to global when propagateToGlobal is true', async () => {
    const error = new Error('Global error');
    mockWithRetry.mockResolvedValue({ success: false, error, attempts: 1 } as any);
    const handleError = getHandleError();
    handleError.mockClear();

    renderHook(() =>
      useRetryableQuery(['global-error-test'], stableFailQueryFn, {
        propagateToGlobal: true,
      })
    );

    await waitFor(() => {
      expect(handleError).toHaveBeenCalled();
    });
  });

  it('should default propagateToGlobal to false', () => {
    mockWithRetry.mockImplementation(() => new Promise(() => {}));
    renderHook(() =>
      useRetryableQuery(['no-propagate-test'], stableFailQueryFn)
    );
    // Just verify the hook renders without crashing when propagateToGlobal is not set
    expect(mockWithRetry).toHaveBeenCalled();
  });

  it('should pass retryConfig to withRetry', () => {
    mockWithRetry.mockImplementation(() => new Promise(() => {}));
    renderHook(() =>
      useRetryableQuery(['config-test'], stableFailQueryFn, {
        retryConfig: { maxAttempts: 5 },
      })
    );
    expect(mockWithRetry).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ maxAttempts: 5 }),
      expect.any(String)
    );
  });
});

describe('useMutation (from retryable-query-types)', () => {
  it('should execute mutation and return data', async () => {
    const { result } = renderHook(() =>
      useMutation({
        mutationFn: async (input: string) => `result-${input}`,
      })
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();

    let mutationResult: any;
    await act(async () => {
      mutationResult = await result.current.mutate('test');
    });

    expect(mutationResult).toBe('result-test');
    expect(result.current.data).toBe('result-test');
    expect(result.current.isLoading).toBe(false);
  });

  it('should call onSuccess callback', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useMutation({
        mutationFn: async (v: string) => v,
        onSuccess,
      })
    );

    await act(async () => {
      await result.current.mutate('data');
    });

    expect(onSuccess).toHaveBeenCalledWith('data', 'data');
  });

  it('should call onMutate callback', async () => {
    const onMutate = vi.fn();
    const { result } = renderHook(() =>
      useMutation({
        mutationFn: async (v: string) => v,
        onMutate,
      })
    );

    await act(async () => {
      await result.current.mutate('data');
    });

    expect(onMutate).toHaveBeenCalledWith('data');
  });

  it('should set error on failure', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useMutation({
        mutationFn: async () => {
          throw new Error('Mutation failed');
        },
        onError,
      })
    );

    await act(async () => {
      try {
        await result.current.mutate(undefined as any);
      } catch {
        // expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(onError).toHaveBeenCalled();
  });
});

describe('retryable-query-presets', () => {
  let presets: typeof import('@/hooks/retryable-query-presets');

  beforeEach(async () => {
    vi.clearAllMocks();
    presets = await import('@/hooks/retryable-query-presets');
  });

  it('should export useNetworkQuery', () => {
    expect(typeof presets.useNetworkQuery).toBe('function');
  });

  it('should export useSupabaseQuery', () => {
    expect(typeof presets.useSupabaseQuery).toBe('function');
  });

  it('should export useVoteQuery', () => {
    expect(typeof presets.useVoteQuery).toBe('function');
  });

  it('should export useVoteMutation', () => {
    expect(typeof presets.useVoteMutation).toBe('function');
  });

  it('should export useAuthQuery', () => {
    expect(typeof presets.useAuthQuery).toBe('function');
  });

  it('should export useRealtimeQuery', () => {
    expect(typeof presets.useRealtimeQuery).toBe('function');
  });

  it('should export useFileUploadQuery', () => {
    expect(typeof presets.useFileUploadQuery).toBe('function');
  });

  it('should export useSafeRetryableQuery', () => {
    expect(typeof presets.useSafeRetryableQuery).toBe('function');
  });
});
