import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateVoteStatusEnhanced,
  calculateTimeLeftEnhanced,
  clearVoteResultsCache,
  getRequestQueueStatus,
  getVoteAPIPerformanceStats,
  getVoteAPICircuitStats,
} from '@/lib/data-fetching/client/vote-api-enhanced';

// Mock dependencies
vi.mock('@/lib/data-fetching/client/vote-service.client', () => ({
  getVoteByIdClient: vi.fn(),
  getVotesClient: vi.fn(),
}));

vi.mock('@/utils/api/enhanced-retry-utils', () => ({
  withVoteOptimization: (fn: any) => fn,
  withPerformanceMonitoring: (fn: any, _label: string) => fn,
  PerformanceMetrics: {
    getMetrics: vi.fn(() => ({ totalRequests: 0, avgResponseTime: 0 })),
  },
  getCircuitBreakerStats: vi.fn(() => ({ state: 'closed', failureCount: 0 })),
}));

describe('calculateVoteStatusEnhanced', () => {
  it('returns "ended" when start_at is null', () => {
    const vote = { start_at: null, stop_at: '2025-12-31T00:00:00Z' } as any;
    expect(calculateVoteStatusEnhanced(vote)).toBe('ended');
  });

  it('returns "ended" when stop_at is null', () => {
    const vote = { start_at: '2025-01-01T00:00:00Z', stop_at: null } as any;
    expect(calculateVoteStatusEnhanced(vote)).toBe('ended');
  });

  it('returns "ended" when both are null', () => {
    const vote = { start_at: null, stop_at: null } as any;
    expect(calculateVoteStatusEnhanced(vote)).toBe('ended');
  });

  it('returns "upcoming" when now is before start_at', () => {
    const future = new Date(Date.now() + 100000000).toISOString();
    const farFuture = new Date(Date.now() + 200000000).toISOString();
    const vote = { start_at: future, stop_at: farFuture } as any;
    expect(calculateVoteStatusEnhanced(vote)).toBe('upcoming');
  });

  it('returns "ongoing" when now is between start_at and stop_at', () => {
    const past = new Date(Date.now() - 100000000).toISOString();
    const future = new Date(Date.now() + 100000000).toISOString();
    const vote = { start_at: past, stop_at: future } as any;
    expect(calculateVoteStatusEnhanced(vote)).toBe('ongoing');
  });

  it('returns "ended" when now is after stop_at', () => {
    const past1 = new Date(Date.now() - 200000000).toISOString();
    const past2 = new Date(Date.now() - 100000000).toISOString();
    const vote = { start_at: past1, stop_at: past2 } as any;
    expect(calculateVoteStatusEnhanced(vote)).toBe('ended');
  });
});

describe('calculateTimeLeftEnhanced', () => {
  it('returns zeros for ended vote', () => {
    const past1 = new Date(Date.now() - 200000000).toISOString();
    const past2 = new Date(Date.now() - 100000000).toISOString();
    const vote = { start_at: past1, stop_at: past2 } as any;
    const result = calculateTimeLeftEnhanced(vote);
    expect(result.totalSeconds).toBe(0);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.seconds).toBe(0);
  });

  it('returns time until start for upcoming vote', () => {
    const futureMs = Date.now() + 90061000; // ~1d 1h 1m 1s
    const future = new Date(futureMs).toISOString();
    const farFuture = new Date(futureMs + 100000000).toISOString();
    const vote = { start_at: future, stop_at: farFuture } as any;
    const result = calculateTimeLeftEnhanced(vote);
    expect(result.totalSeconds).toBeGreaterThan(0);
    expect(result.days).toBeGreaterThanOrEqual(0);
  });

  it('returns time until stop for ongoing vote', () => {
    const past = new Date(Date.now() - 100000000).toISOString();
    const futureMs = Date.now() + 7200000; // 2 hours
    const future = new Date(futureMs).toISOString();
    const vote = { start_at: past, stop_at: future } as any;
    const result = calculateTimeLeftEnhanced(vote);
    expect(result.totalSeconds).toBeGreaterThan(0);
    expect(result.hours).toBeGreaterThanOrEqual(1);
  });

  it('correctly breaks down days, hours, minutes, seconds', () => {
    // 1 day + 2 hours + 3 minutes + 4 seconds = 93784 seconds
    const futureMs = Date.now() + 93784 * 1000;
    const past = new Date(Date.now() - 10000).toISOString();
    const future = new Date(futureMs).toISOString();
    const vote = { start_at: past, stop_at: future } as any;
    const result = calculateTimeLeftEnhanced(vote);
    expect(result.days).toBe(1);
    expect(result.hours).toBe(2);
    expect(result.minutes).toBe(3);
    // seconds can vary slightly due to test execution time
    expect(result.seconds).toBeGreaterThanOrEqual(2);
    expect(result.seconds).toBeLessThanOrEqual(5);
  });

  it('returns zeros when null dates', () => {
    const vote = { start_at: null, stop_at: null } as any;
    const result = calculateTimeLeftEnhanced(vote);
    expect(result.totalSeconds).toBe(0);
  });
});

describe('clearVoteResultsCache', () => {
  it('clears specific vote cache when voteId provided', () => {
    // Just verify it doesn't throw
    clearVoteResultsCache(123);
  });

  it('clears all cache when no voteId provided', () => {
    clearVoteResultsCache();
  });
});

describe('getRequestQueueStatus', () => {
  it('returns queue status object', () => {
    const status = getRequestQueueStatus();
    expect(status).toHaveProperty('queueSize');
    expect(status).toHaveProperty('requests');
    expect(Array.isArray(status.requests)).toBe(true);
  });

  it('initially has empty queue', () => {
    const status = getRequestQueueStatus();
    expect(status.queueSize).toBe(0);
    expect(status.requests).toEqual([]);
  });
});

describe('getVoteAPIPerformanceStats', () => {
  it('returns performance metrics', () => {
    const stats = getVoteAPIPerformanceStats();
    expect(stats).toBeDefined();
  });
});

describe('getVoteAPICircuitStats', () => {
  it('returns circuit breaker stats', () => {
    const stats = getVoteAPICircuitStats();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('state');
  });
});

describe('submitVoteEnhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a vote successfully', async () => {
    const mockResponse = { success: true, data: { id: 1 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { submitVoteEnhanced } = await import('@/lib/data-fetching/client/vote-api-enhanced');

    const result = await submitVoteEnhanced({
      voteId: 1,
      voteItemId: 2,
      amount: 1,
      userId: 'user-1',
      totalBonusRemain: 10,
    });

    expect(result).toEqual(mockResponse);
  });

  it('handles failed response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request', details: 'Invalid vote' }),
    });

    const { submitVoteEnhanced } = await import('@/lib/data-fetching/client/vote-api-enhanced');

    const result = await submitVoteEnhanced({
      voteId: 1,
      voteItemId: 2,
      amount: 1,
      userId: 'user-2',
      totalBonusRemain: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { submitVoteEnhanced } = await import('@/lib/data-fetching/client/vote-api-enhanced');

    const result = await submitVoteEnhanced({
      voteId: 1,
      voteItemId: 2,
      amount: 1,
      userId: 'user-3',
      totalBonusRemain: 10,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });
});

describe('getVoteResultsEnhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVoteResultsCache();
  });

  it('fetches vote results successfully', async () => {
    const mockData = { voteId: 1, title: 'Test', status: 'ongoing', totalVotes: 100, results: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockData }),
    });

    const { getVoteResultsEnhanced } = await import('@/lib/data-fetching/client/vote-api-enhanced');
    const result = await getVoteResultsEnhanced(1);
    expect(result).toEqual(mockData);
  });

  it('throws on failed response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    const { getVoteResultsEnhanced } = await import('@/lib/data-fetching/client/vote-api-enhanced');
    await expect(getVoteResultsEnhanced(999)).rejects.toThrow();
  });

  it('throws on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network fail'));

    const { getVoteResultsEnhanced } = await import('@/lib/data-fetching/client/vote-api-enhanced');
    await expect(getVoteResultsEnhanced(888)).rejects.toThrow('Network error');
  });
});
