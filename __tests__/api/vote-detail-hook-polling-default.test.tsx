import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detailMocks = vi.hoisted(() => ({
  useVotePolling: vi.fn(),
}));

vi.mock('@/components/client/vote/detail/useVotePolling', () => ({
  useVotePolling: detailMocks.useVotePolling,
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: (selector: (state: { currentLanguage: string }) => unknown) =>
    selector({ currentLanguage: 'ko' }),
}));

vi.mock('@/hooks/useAuthGuard', () => ({
  useRequireAuth: () => ({ withAuth: vi.fn() }),
}));

vi.mock('@/hooks/useWithdrawalGuard', () => ({
  useWithdrawalGuard: () => vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userProfile: null }),
}));

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

import { useVoteDetail } from '@/components/client/vote/detail/useVoteDetail';
import { DEFAULT_THRESHOLDS } from '@/components/client/vote/detail/vote-polling-data';

describe('vote detail polling defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detailMocks.useVotePolling.mockReturnValue({
      voteItems: [],
      setVoteItems: vi.fn(),
      userVote: null,
      notifications: [],
      removeNotification: vi.fn(),
      addNotification: vi.fn(),
      connectionState: {
        mode: 'polling',
        isConnected: false,
        lastUpdate: null,
        errorCount: 0,
        retryCount: 0,
      },
      pollingStartTime: null,
      lastPollingUpdate: null,
      pollingErrorCount: 0,
      updateVoteDataPolling: vi.fn(),
      user: null,
      connectionQuality: {
        score: 100,
        latency: 0,
        errorRate: 0,
        consecutiveErrors: 0,
        consecutiveSuccesses: 0,
        lastConnectionTime: null,
        averageResponseTime: 0,
      },
      recentlyUpdatedItemsRef: { current: new Set() },
      hasReachedVoteDeadline: false,
    });
  });

  it('uses five seconds when VoteDetailPresenter omits pollingInterval', () => {
    renderHook(() =>
      useVoteDetail({
        vote: {
          id: 295,
          start_at: '2020-01-01T00:00:00.000Z',
          stop_at: '2099-01-01T00:00:00.000Z',
        } as any,
        initialItems: [],
        rewards: [],
        lang: 'ko',
      }),
    );

    expect(detailMocks.useVotePolling).toHaveBeenLastCalledWith(
      expect.objectContaining({ pollingInterval: 5000 }),
    );
    expect(DEFAULT_THRESHOLDS.pollingInterval).toBe(5000);
  });
});
