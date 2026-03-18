import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// --- Mocks ---

const mockMutate = vi.fn();
const mockUseSWR = vi.fn();

vi.mock('swr', () => ({
  default: (...args: any[]) => mockUseSWR(...args),
}));

vi.mock('@/stores/voteFilterStore', () => ({
  VOTE_STATUS: {
    UPCOMING: 'upcoming',
    ONGOING: 'ongoing',
    COMPLETED: 'completed',
    ADMIN: 'admin',
  },
  VOTE_AREAS: {
    ALL: 'all',
    KPOP: 'kpop',
    MUSICAL: 'musical',
    PIC_CHART: 'pic-chart',
  },
}));

// --- Import after mocks ---

import { useVoteList } from '@/hooks/useVoteList';

describe('useVoteList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSWR.mockReturnValue({
      data: { data: [], count: 0, totalPages: 1 },
      error: null,
      isLoading: false,
      mutate: mockMutate,
    });
  });

  describe('default behavior', () => {
    it('should return empty votes by default', () => {
      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.votes).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.totalPages).toBe(1);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should pass correct URL to SWR with default params', () => {
      renderHook(() => useVoteList({}));
      const calledUrl = mockUseSWR.mock.calls[0][0];
      expect(calledUrl).toContain('/api/votes?');
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('limit=10');
    });
  });

  describe('with parameters', () => {
    it('should include status in URL', () => {
      renderHook(() => useVoteList({ status: 'ongoing' }));
      const calledUrl = mockUseSWR.mock.calls[0][0];
      expect(calledUrl).toContain('status=ongoing');
    });

    it('should include area in URL', () => {
      renderHook(() => useVoteList({ area: 'kpop' }));
      const calledUrl = mockUseSWR.mock.calls[0][0];
      expect(calledUrl).toContain('area=kpop');
    });

    it('should include page in URL', () => {
      renderHook(() => useVoteList({ page: 3 }));
      const calledUrl = mockUseSWR.mock.calls[0][0];
      expect(calledUrl).toContain('page=3');
    });

    it('should include limit in URL', () => {
      renderHook(() => useVoteList({ limit: 25 }));
      const calledUrl = mockUseSWR.mock.calls[0][0];
      expect(calledUrl).toContain('limit=25');
    });

    it('should include all params', () => {
      renderHook(() =>
        useVoteList({ status: 'upcoming', area: 'musical', page: 2, limit: 5 })
      );
      const calledUrl = mockUseSWR.mock.calls[0][0];
      expect(calledUrl).toContain('status=upcoming');
      expect(calledUrl).toContain('area=musical');
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=5');
    });
  });

  describe('with initial votes', () => {
    it('should use initialVotes as fallback data', () => {
      const initialVotes = [
        { id: 1, title: 'Vote 1' },
        { id: 2, title: 'Vote 2' },
      ] as any;

      renderHook(() => useVoteList({ initialVotes }));
      const swrOptions = mockUseSWR.mock.calls[0][2];
      expect(swrOptions.fallbackData).toEqual({
        data: initialVotes,
        count: 2,
      });
    });

    it('should not set fallbackData when initialVotes is empty', () => {
      renderHook(() => useVoteList({ initialVotes: [] }));
      const swrOptions = mockUseSWR.mock.calls[0][2];
      expect(swrOptions.fallbackData).toBeUndefined();
    });
  });

  describe('data mapping', () => {
    it('should map votes from data response', () => {
      const votes = [
        { id: 1, title: 'Vote A' },
        { id: 2, title: 'Vote B' },
      ];
      mockUseSWR.mockReturnValue({
        data: { data: votes, count: 2, totalPages: 1 },
        error: null,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.votes).toEqual(votes);
      expect(result.current.totalCount).toBe(2);
    });

    it('should return empty array when data is null', () => {
      mockUseSWR.mockReturnValue({
        data: null,
        error: null,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.votes).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.totalPages).toBe(1);
    });

    it('should return empty array when data.data is missing', () => {
      mockUseSWR.mockReturnValue({
        data: { count: 5 },
        error: null,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.votes).toEqual([]);
    });
  });

  describe('loading state', () => {
    it('should return isLoading from SWR', () => {
      mockUseSWR.mockReturnValue({
        data: null,
        error: null,
        isLoading: true,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('error state', () => {
    it('should return error from SWR', () => {
      const error = new Error('Fetch failed');
      mockUseSWR.mockReturnValue({
        data: null,
        error,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.error).toBe(error);
    });
  });

  describe('refetch', () => {
    it('should expose mutate as refetch', () => {
      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.refetch).toBe(mockMutate);
    });

    it('should call SWR mutate when refetch is called', () => {
      const { result } = renderHook(() => useVoteList({}));
      result.current.refetch();
      expect(mockMutate).toHaveBeenCalled();
    });
  });

  describe('totalPages', () => {
    it('should return totalPages from data', () => {
      mockUseSWR.mockReturnValue({
        data: { data: [], count: 50, totalPages: 5 },
        error: null,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.totalPages).toBe(5);
    });

    it('should default to 1 when totalPages is missing', () => {
      mockUseSWR.mockReturnValue({
        data: { data: [], count: 0 },
        error: null,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useVoteList({}));
      expect(result.current.totalPages).toBe(1);
    });
  });
});
