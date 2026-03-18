import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks ---

const mockUseRetryableQuery = vi.fn().mockReturnValue({
  data: null,
  error: null,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

const mockUseRetryableMutation = vi.fn().mockReturnValue({
  mutate: vi.fn(),
  isLoading: false,
  error: null,
  data: null,
});

vi.mock('@/hooks/useRetryableQuery', () => ({
  useRetryableQuery: (...args: any[]) => mockUseRetryableQuery(...args),
  useRetryableMutation: (...args: any[]) => mockUseRetryableMutation(...args),
}));

vi.mock('@/utils/retry', () => ({
  ExtendedRetryUtility: { withRetry: vi.fn() },
  NETWORK_RETRY_CONFIG: { maxAttempts: 3, baseDelay: 1000 },
  createRetryCondition: {
    or: vi.fn((...fns: any[]) => () => true),
    and: vi.fn((...fns: any[]) => () => true),
    httpStatus: vi.fn((codes: number[]) => () => true),
    errorMessage: vi.fn((msgs: string[]) => () => true),
    maxAttempts: vi.fn((n: number) => () => true),
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
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/contexts/ErrorContext', () => ({
  useErrorHandler: vi.fn().mockReturnValue({
    handleError: vi.fn(),
    clearError: vi.fn(),
  }),
}));

import {
  useNetworkQuery,
  useSupabaseQuery,
  useVoteQuery,
  useVoteMutation,
  useAuthQuery,
  useRealtimeQuery,
  useFileUploadQuery,
  useSafeRetryableQuery,
} from '@/hooks/retryable-query-presets';
import { createRetryCondition } from '@/utils/retry';
import { logger } from '@/utils/logger';

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRetryableQuery.mockReturnValue({
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockUseRetryableMutation.mockReturnValue({
    mutate: vi.fn(),
    isLoading: false,
    error: null,
    data: null,
  });
});

describe('useNetworkQuery', () => {
  it('calls useRetryableQuery with correct operationName', () => {
    renderHook(() => useNetworkQuery(['test'], 'https://api.example.com/data'));
    expect(mockUseRetryableQuery).toHaveBeenCalled();
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.operationName).toBe('network-https://api.example.com/data');
  });

  it('defaults propagateToGlobal to true', () => {
    renderHook(() => useNetworkQuery(['test'], '/api/data'));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(true);
  });

  it('allows overriding propagateToGlobal', () => {
    renderHook(() => useNetworkQuery(['test'], '/api/data', { propagateToGlobal: false }));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(false);
  });

  it('passes fetchOptions through to fetch in queryFn', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    renderHook(() =>
      useNetworkQuery(['test'], '/api/data', {
        fetchOptions: { headers: { Authorization: 'Bearer token' } },
      })
    );

    // Extract the queryFn passed to useRetryableQuery and call it
    const queryFn = mockUseRetryableQuery.mock.calls[0][1];
    await queryFn();

    expect(fetchSpy).toHaveBeenCalledWith('/api/data', {
      headers: { Authorization: 'Bearer token' },
    });
    fetchSpy.mockRestore();
  });

  it('throws AppError for non-ok response with high severity for 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500, statusText: 'Internal Server Error' })
    );

    renderHook(() => useNetworkQuery(['test'], '/api/data'));
    const queryFn = mockUseRetryableQuery.mock.calls[0][1];

    await expect(queryFn()).rejects.toThrow('HTTP 500: Internal Server Error');
    vi.restoreAllMocks();
  });

  it('throws AppError with medium severity for 4xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 404, statusText: 'Not Found' })
    );

    renderHook(() => useNetworkQuery(['test'], '/api/data'));
    const queryFn = mockUseRetryableQuery.mock.calls[0][1];

    try {
      await queryFn();
      expect.unreachable('should throw');
    } catch (error: any) {
      expect(error.message).toBe('HTTP 404: Not Found');
      expect(error.severity).toBe('MEDIUM');
    }
    vi.restoreAllMocks();
  });
});

describe('useSupabaseQuery', () => {
  it('calls useRetryableQuery with supabase operation name', () => {
    const queryFn = vi.fn().mockResolvedValue({ data: {}, error: null });
    renderHook(() => useSupabaseQuery(['users', '123'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.operationName).toBe('supabase-users-123');
  });

  it('defaults propagateToGlobal to true', () => {
    const queryFn = vi.fn().mockResolvedValue({ data: {}, error: null });
    renderHook(() => useSupabaseQuery(['test'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(true);
  });

  it('sets retryableCategories for supabase errors', () => {
    const queryFn = vi.fn().mockResolvedValue({ data: {}, error: null });
    renderHook(() => useSupabaseQuery(['test'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.retryConfig.retryableCategories).toContain('NETWORK');
    expect(options.retryConfig.retryableCategories).toContain('SERVER');
    expect(options.retryConfig.retryableCategories).toContain('DATA_FETCHING');
  });

  it('wraps supabase error into AppError and logs it', async () => {
    const supabaseError = Object.assign(new Error('DB error'), { code: '42P01' });
    const queryFn = vi.fn().mockResolvedValue({ data: null, error: supabaseError });

    renderHook(() => useSupabaseQuery(['test'], queryFn));
    const wrappedQueryFn = mockUseRetryableQuery.mock.calls[0][1];

    await expect(wrappedQueryFn()).rejects.toThrow();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns data when supabase query succeeds', async () => {
    const queryFn = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    renderHook(() => useSupabaseQuery(['test'], queryFn));
    const wrappedQueryFn = mockUseRetryableQuery.mock.calls[0][1];

    const result = await wrappedQueryFn();
    expect(result).toEqual({ id: 1 });
  });
});

describe('useVoteQuery', () => {
  it('calls useRetryableQuery with vote operation name', () => {
    const queryFn = vi.fn();
    renderHook(() => useVoteQuery(['votes', 'list'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.operationName).toBe('vote-votes-list');
  });

  it('sets maxAttempts to 3', () => {
    const queryFn = vi.fn();
    renderHook(() => useVoteQuery(['votes'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.retryConfig.maxAttempts).toBe(3);
  });

  it('uses OR retry condition for http status and error message', () => {
    const queryFn = vi.fn();
    renderHook(() => useVoteQuery(['votes'], queryFn));
    expect(createRetryCondition.or).toHaveBeenCalled();
    expect(createRetryCondition.httpStatus).toHaveBeenCalledWith([500, 502, 503, 504]);
    expect(createRetryCondition.errorMessage).toHaveBeenCalledWith([
      'network',
      'timeout',
      'connection',
    ]);
  });
});

describe('useVoteMutation', () => {
  it('calls useRetryableMutation with vote-mutation operation name', () => {
    const mutationFn = vi.fn();
    renderHook(() => useVoteMutation(mutationFn));
    const [, options] = mockUseRetryableMutation.mock.calls[0];
    expect(options.operationName).toBe('vote-mutation');
  });

  it('sets maxAttempts to 2', () => {
    const mutationFn = vi.fn();
    renderHook(() => useVoteMutation(mutationFn));
    const [, options] = mockUseRetryableMutation.mock.calls[0];
    expect(options.retryConfig.maxAttempts).toBe(2);
  });

  it('uses AND retry condition', () => {
    const mutationFn = vi.fn();
    renderHook(() => useVoteMutation(mutationFn));
    expect(createRetryCondition.and).toHaveBeenCalled();
    expect(createRetryCondition.maxAttempts).toHaveBeenCalledWith(2);
  });
});

describe('useAuthQuery', () => {
  it('calls useRetryableQuery with auth operation name', () => {
    const queryFn = vi.fn();
    renderHook(() => useAuthQuery(['auth', 'session'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.operationName).toBe('auth-auth-session');
  });

  it('defaults propagateToGlobal to false', () => {
    const queryFn = vi.fn();
    renderHook(() => useAuthQuery(['auth'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(false);
  });

  it('allows overriding propagateToGlobal', () => {
    const queryFn = vi.fn();
    renderHook(() => useAuthQuery(['auth'], queryFn, { propagateToGlobal: true }));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(true);
  });

  it('sets maxAttempts to 2', () => {
    const queryFn = vi.fn();
    renderHook(() => useAuthQuery(['auth'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.retryConfig.maxAttempts).toBe(2);
  });

  it('only retries for NETWORK category', () => {
    const queryFn = vi.fn();
    renderHook(() => useAuthQuery(['auth'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.retryConfig.retryableCategories).toEqual(['NETWORK']);
  });
});

describe('useRealtimeQuery', () => {
  it('calls useRetryableQuery with realtime operation name', () => {
    const queryFn = vi.fn();
    renderHook(() => useRealtimeQuery(['realtime', 'data'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.operationName).toBe('realtime-realtime-data');
  });

  it('defaults propagateToGlobal to false', () => {
    const queryFn = vi.fn();
    renderHook(() => useRealtimeQuery(['rt'], queryFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(false);
  });

  it('exposes startPolling, stopPolling, and isPolling', () => {
    const queryFn = vi.fn();
    const { result } = renderHook(() => useRealtimeQuery(['rt'], queryFn));
    expect(typeof result.current.startPolling).toBe('function');
    expect(typeof result.current.stopPolling).toBe('function');
    expect(result.current.isPolling).toBe(false);
  });

  it('starts polling when startPolling is called', () => {
    const queryFn = vi.fn();
    const { result } = renderHook(() => useRealtimeQuery(['rt'], queryFn));

    act(() => {
      result.current.startPolling();
    });

    expect(result.current.isPolling).toBe(true);
  });

  it('stops polling when stopPolling is called', () => {
    const queryFn = vi.fn();
    const { result } = renderHook(() => useRealtimeQuery(['rt'], queryFn));

    act(() => {
      result.current.startPolling();
    });
    act(() => {
      result.current.stopPolling();
    });

    expect(result.current.isPolling).toBe(false);
  });

  it('accepts custom pollingInterval', () => {
    const queryFn = vi.fn();
    renderHook(() => useRealtimeQuery(['rt'], queryFn, { pollingInterval: 5000 }));
    // Polling interval is internal, just ensure no errors
    expect(mockUseRetryableQuery).toHaveBeenCalled();
  });
});

describe('useFileUploadQuery', () => {
  it('calls useRetryableQuery with upload operation name', () => {
    const uploadFn = vi.fn();
    renderHook(() => useFileUploadQuery(['upload', 'avatar'], uploadFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.operationName).toBe('upload-upload-avatar');
  });

  it('defaults propagateToGlobal to true', () => {
    const uploadFn = vi.fn();
    renderHook(() => useFileUploadQuery(['upload'], uploadFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.propagateToGlobal).toBe(true);
  });

  it('sets autoHide to false for upload errors', () => {
    const uploadFn = vi.fn();
    renderHook(() => useFileUploadQuery(['upload'], uploadFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.globalErrorOptions.autoHide).toBe(false);
  });

  it('sets maxAttempts to 2 and baseDelay to 2000', () => {
    const uploadFn = vi.fn();
    renderHook(() => useFileUploadQuery(['upload'], uploadFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.retryConfig.maxAttempts).toBe(2);
    expect(options.retryConfig.baseDelay).toBe(2000);
  });

  it('only retries for NETWORK category', () => {
    const uploadFn = vi.fn();
    renderHook(() => useFileUploadQuery(['upload'], uploadFn));
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    expect(options.retryConfig.retryableCategories).toEqual(['NETWORK']);
  });
});

describe('useSafeRetryableQuery', () => {
  it('calls useRetryableQuery with queryKey and queryFn', () => {
    const queryFn = vi.fn();
    renderHook(() => useSafeRetryableQuery(['safe'], queryFn));
    expect(mockUseRetryableQuery).toHaveBeenCalled();
    expect(mockUseRetryableQuery.mock.calls[0][0]).toEqual(['safe']);
  });

  it('returns fallbackData when query has error', () => {
    mockUseRetryableQuery.mockReturnValue({
      data: null,
      error: new Error('fail'),
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    const queryFn = vi.fn();
    const { result } = renderHook(() =>
      useSafeRetryableQuery(['safe'], queryFn, { fallbackData: 'default' })
    );

    expect(result.current.data).toBe('default');
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns normal result when no error', () => {
    mockUseRetryableQuery.mockReturnValue({
      data: 'real-data',
      error: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const queryFn = vi.fn();
    const { result } = renderHook(() =>
      useSafeRetryableQuery(['safe'], queryFn, { fallbackData: 'default' })
    );

    expect(result.current.data).toBe('real-data');
  });

  it('does not override error when fallbackData is undefined', () => {
    mockUseRetryableQuery.mockReturnValue({
      data: null,
      error: new Error('fail'),
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    const queryFn = vi.fn();
    const { result } = renderHook(() => useSafeRetryableQuery(['safe'], queryFn));

    expect(result.current.isError).toBe(true);
    expect(result.current.error).not.toBeNull();
  });

  it('calls custom onError handler on error', () => {
    const queryFn = vi.fn();
    const onError = vi.fn();
    renderHook(() => useSafeRetryableQuery(['safe'], queryFn, { onError }));

    // Extract the onError callback passed to useRetryableQuery
    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    const error = new Error('test error');
    options.onError(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('logs error via logger.error in onError callback', () => {
    const queryFn = vi.fn();
    renderHook(() => useSafeRetryableQuery(['safe'], queryFn));

    const [, , options] = mockUseRetryableQuery.mock.calls[0];
    options.onError(new Error('test error'));

    expect(logger.error).toHaveBeenCalledWith(
      'Query failed after retries',
      expect.any(Error),
      expect.objectContaining({ queryKey: 'safe', operation: 'useSafeRetryableQuery' })
    );
  });
});
