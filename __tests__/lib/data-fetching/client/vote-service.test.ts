import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVotesClient, getVoteByIdClient } from '@/lib/data-fetching/client/vote-service.client';

// Mock voteFilterStore constants
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

function createMockSupabaseClient(overrides: {
  data?: any;
  error?: any;
} = {}) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({
      data: overrides.data ?? [],
      error: overrides.error ?? null,
    }),
    single: vi.fn().mockResolvedValue({
      data: overrides.data ?? null,
      error: overrides.error ?? null,
    }),
  };

  return {
    from: vi.fn().mockReturnValue(mockQuery),
    _mockQuery: mockQuery,
  };
}

describe('vote-service.client', () => {
  describe('getVotesClient', () => {
    it('should return transformed vote data', async () => {
      const rawVote = {
        id: 1,
        title: 'Test Vote',
        start_at: '2024-01-01T00:00:00Z',
        stop_at: '2024-12-31T23:59:59Z',
        vote_item: [
          {
            id: 10,
            vote_id: 1,
            artist_id: 100,
            group_id: null,
            vote_total: 500,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
            deleted_at: null,
            artist: {
              id: 100,
              name: 'Artist A',
              image: 'http://img.com/a.png',
              artist_group: { id: 1, name: 'Group A' },
            },
          },
        ],
        vote_reward: [
          {
            reward_id: 1,
            reward: { id: 1, name: 'Reward 1', image: 'http://img.com/r1.png' },
          },
        ],
      };

      const client = createMockSupabaseClient({ data: [rawVote] });
      const result = await getVotesClient(client as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].voteItem).toHaveLength(1);
      expect(result[0].voteItem[0].artist.name).toBe('Artist A');
      expect(result[0].voteItem[0].artist.artistGroup).toEqual({ id: 1, name: 'Group A' });
      expect(result[0].voteReward).toHaveLength(1);
      expect(result[0].voteReward[0].reward.name).toBe('Reward 1');
    });

    it('should filter out deleted vote items', async () => {
      const rawVote = {
        id: 1,
        title: 'Test',
        vote_item: [
          { id: 10, deleted_at: null, artist: null },
          { id: 11, deleted_at: '2024-06-01T00:00:00Z', artist: null },
        ],
        vote_reward: [],
      };

      const client = createMockSupabaseClient({ data: [rawVote] });
      const result = await getVotesClient(client as any);

      expect(result[0].voteItem).toHaveLength(1);
      expect(result[0].voteItem[0].id).toBe(10);
    });

    it('should handle vote items without artist', async () => {
      const rawVote = {
        id: 1,
        vote_item: [
          { id: 10, deleted_at: null, artist: null },
        ],
        vote_reward: [],
      };

      const client = createMockSupabaseClient({ data: [rawVote] });
      const result = await getVotesClient(client as any);

      expect(result[0].voteItem[0].artist).toBeNull();
    });

    it('should handle empty vote_reward', async () => {
      const rawVote = {
        id: 1,
        vote_item: [],
        vote_reward: null,
      };

      const client = createMockSupabaseClient({ data: [rawVote] });
      const result = await getVotesClient(client as any);

      expect(result[0].voteReward).toEqual([]);
    });

    it('should return empty array for empty data', async () => {
      const client = createMockSupabaseClient({ data: [] });
      const result = await getVotesClient(client as any);
      expect(result).toEqual([]);
    });

    it('should return empty array for null data', async () => {
      const client = createMockSupabaseClient({ data: null });
      // Mock the order to return null data
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const c = { from: vi.fn().mockReturnValue(mockQuery) };
      const result = await getVotesClient(c as any);
      expect(result).toEqual([]);
    });

    it('should throw on supabase error', async () => {
      const mockError = { message: 'Database error', code: '42P01' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };
      const client = { from: vi.fn().mockReturnValue(mockQuery) };

      await expect(getVotesClient(client as any)).rejects.toEqual(mockError);
    });

    it('should apply status filter for ongoing votes', async () => {
      const client = createMockSupabaseClient({ data: [] });
      await getVotesClient(client as any, 'ongoing');

      const mockQuery = client._mockQuery;
      expect(mockQuery.lte).toHaveBeenCalled();
      expect(mockQuery.gt).toHaveBeenCalled();
    });

    it('should apply area filter for kpop', async () => {
      const client = createMockSupabaseClient({ data: [] });
      await getVotesClient(client as any, undefined, 'kpop');

      const mockQuery = client._mockQuery;
      expect(mockQuery.contains).toHaveBeenCalledWith('areas', ['kpop']);
    });

    it('should apply pic-chart area filter using areas array', async () => {
      const client = createMockSupabaseClient({ data: [] });
      await getVotesClient(client as any, undefined, 'pic-chart');

      const mockQuery = client._mockQuery;
      expect(mockQuery.contains).toHaveBeenCalledWith('areas', ['pic-chart']);
    });

    it('should not apply area filter for "all"', async () => {
      const client = createMockSupabaseClient({ data: [] });
      await getVotesClient(client as any, undefined, 'all');

      const mockQuery = client._mockQuery;
      expect(mockQuery.contains).not.toHaveBeenCalled();
      expect(mockQuery.in).not.toHaveBeenCalled();
    });
  });

  describe('getVoteByIdClient', () => {
    it('should return a single transformed vote', async () => {
      const rawVote = {
        id: 42,
        title: 'Single Vote',
        vote_item: [
          {
            id: 10,
            deleted_at: null,
            artist: { id: 1, name: 'Artist', image: null, artist_group: null },
          },
        ],
        vote_reward: [],
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: rawVote, error: null }),
      };
      const client = { from: vi.fn().mockReturnValue(mockQuery) };

      const result = await getVoteByIdClient(client as any, 42);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(42);
      expect(result!.voteItem).toHaveLength(1);
    });

    it('should return null when no data found', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const client = { from: vi.fn().mockReturnValue(mockQuery) };

      const result = await getVoteByIdClient(client as any, 999);
      expect(result).toBeNull();
    });

    it('should throw on supabase error', async () => {
      const mockError = { message: 'Not found', code: 'PGRST116' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };
      const client = { from: vi.fn().mockReturnValue(mockQuery) };

      await expect(getVoteByIdClient(client as any, 999)).rejects.toEqual(mockError);
    });

    it('should accept string id', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const client = { from: vi.fn().mockReturnValue(mockQuery) };

      const result = await getVoteByIdClient(client as any, '42');
      expect(mockQuery.eq).toHaveBeenCalledWith('id', '42');
      expect(result).toBeNull();
    });

    it('should handle vote_reward with null reward', async () => {
      const rawVote = {
        id: 1,
        vote_item: [],
        vote_reward: [{ reward_id: 1, reward: null }],
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: rawVote, error: null }),
      };
      const client = { from: vi.fn().mockReturnValue(mockQuery) };

      const result = await getVoteByIdClient(client as any, 1);
      expect(result!.voteReward[0].reward).toBeNull();
    });
  });
});
