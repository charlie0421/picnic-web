import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const mockSelect = vi.fn();
const mockIs = vi.fn();
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockIn = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock('@/utils/api/queries-helpers', () => ({
  FALLBACK_VOTES: [],
  FALLBACK_REWARDS: [],
  withTimeout: vi.fn(async (promise: Promise<any>, _fallback: any, _label: string) => {
    return promise;
  }),
  logRequestError: vi.fn(),
}));

import { _getVotes, _getVoteById, _getVoteItems, _getVoteRewards } from '@/utils/api/queries-vote';

describe('queries-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('_getVotes', () => {
    it('returns mapped vote data with vote items and rewards', async () => {
      const mockVote = {
        id: 1,
        title: 'Vote 1',
        deleted_at: null,
        start_at: '2024-01-01',
        stop_at: '2024-12-31',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        main_image: 'main.jpg',
        result_image: 'result.jpg',
        wait_image: 'wait.jpg',
        vote_category: 'category',
        vote_content: 'content',
        vote_sub_category: 'sub',
        visible_at: '2024-01-01',
        vote_item: [
          {
            id: 10,
            deleted_at: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-02',
            vote_id: 1,
            artist_id: 100,
            group_id: 200,
            vote_total: 50,
            artist: { id: 100, name: 'Artist', image: 'artist.jpg', artist_group: { id: 200, name: 'Group' } },
          },
        ],
        vote_reward: [
          { reward_id: 5, reward: { id: 5, title: 'Reward' } },
        ],
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [mockVote], error: null });

      const result = await _getVotes();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 1,
          deletedAt: null,
          startAt: '2024-01-01',
          stopAt: '2024-12-31',
          mainImage: 'main.jpg',
          resultImage: 'result.jpg',
          waitImage: 'wait.jpg',
          voteCategory: 'category',
          voteContent: 'content',
          voteSubCategory: 'sub',
          visibleAt: '2024-01-01',
          title: 'Vote 1',
        }),
      );
      expect(result[0].voteItems).toHaveLength(1);
      expect(result[0].voteItems[0]).toEqual(
        expect.objectContaining({
          id: 10,
          voteId: 1,
          artistId: 100,
          groupId: 200,
          voteTotal: 50,
        }),
      );
      expect(result[0].rewards).toHaveLength(1);
    });

    it('returns fallback votes when data is empty', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [], error: null });

      const result = await _getVotes();
      expect(result).toEqual([]);
    });

    it('returns fallback votes when data is null', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: null, error: null });

      const result = await _getVotes();
      expect(result).toEqual([]);
    });

    it('returns fallback votes on supabase error', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await _getVotes();
      expect(result).toEqual([]);
    });

    it('handles vote with null vote_item', async () => {
      const mockVote = {
        id: 1, title: null,
        deleted_at: null, start_at: '', stop_at: '', created_at: '', updated_at: '',
        main_image: null, result_image: null, wait_image: null,
        vote_category: null, vote_content: null, vote_sub_category: null, visible_at: null,
        vote_item: null,
        vote_reward: null,
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [mockVote], error: null });

      const result = await _getVotes();
      expect(result[0].voteItems).toEqual([]);
      expect(result[0].rewards).toEqual([]);
      expect(result[0].title).toBe('제목 없음');
    });

    it('handles vote_item with null artist', async () => {
      const mockVote = {
        id: 1, title: 'T',
        deleted_at: null, start_at: '', stop_at: '', created_at: '', updated_at: '',
        main_image: null, result_image: null, wait_image: null,
        vote_category: null, vote_content: null, vote_sub_category: null, visible_at: null,
        vote_item: [
          {
            id: 10, deleted_at: null, created_at: '', updated_at: '',
            vote_id: 1, artist_id: null, group_id: null,
            vote_total: null, artist: null,
          },
        ],
        vote_reward: [],
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [mockVote], error: null });

      const result = await _getVotes();
      expect(result[0].voteItems[0].artist).toBeNull();
      expect(result[0].voteItems[0].voteTotal).toBe(0); // null -> 0
    });

    it('filters null rewards from vote_reward', async () => {
      const mockVote = {
        id: 1, title: 'T',
        deleted_at: null, start_at: '', stop_at: '', created_at: '', updated_at: '',
        main_image: null, result_image: null, wait_image: null,
        vote_category: null, vote_content: null, vote_sub_category: null, visible_at: null,
        vote_item: [],
        vote_reward: [
          { reward_id: 1, reward: null },
          { reward_id: 2, reward: { id: 2, title: 'R' } },
        ],
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [mockVote], error: null });

      const result = await _getVotes();
      expect(result[0].rewards).toHaveLength(1);
      expect(result[0].rewards[0]).toEqual({ id: 2, title: 'R' });
    });
  });

  describe('_getVoteById', () => {
    it('returns mapped vote data for valid id', async () => {
      const mockVote = {
        id: 1, title: 'Vote',
        deleted_at: null, start_at: '2024-01-01', stop_at: '2024-12-31',
        created_at: '2024-01-01', updated_at: '2024-01-02',
        main_image: 'main.jpg', result_image: 'res.jpg', wait_image: 'wait.jpg',
        vote_category: 'cat', vote_content: 'con', vote_sub_category: 'sub',
        visible_at: '2024-01-01',
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: mockVote, error: null });

      const result = await _getVoteById(1);
      expect(result).toEqual(
        expect.objectContaining({
          id: 1,
          title: 'Vote',
          deletedAt: null,
          startAt: '2024-01-01',
          stopAt: '2024-12-31',
          mainImage: 'main.jpg',
          resultImage: 'res.jpg',
          waitImage: 'wait.jpg',
          voteCategory: 'cat',
          voteContent: 'con',
          voteSubCategory: 'sub',
        }),
      );
    });

    it('returns null when vote not found', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: null, error: null });

      const result = await _getVoteById(999);
      expect(result).toBeNull();
    });

    it('returns null on supabase error', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await _getVoteById(1);
      expect(result).toBeNull();
    });

    it('uses "제목 없음" for null title', async () => {
      const mockVote = {
        id: 1, title: null,
        deleted_at: null, start_at: '', stop_at: '', created_at: '', updated_at: '',
        main_image: null, result_image: null, wait_image: null,
        vote_category: null, vote_content: null, vote_sub_category: null, visible_at: null,
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: mockVote, error: null });

      const result = await _getVoteById(1);
      expect(result!.title).toBe('제목 없음');
    });
  });

  describe('_getVoteItems', () => {
    it('returns mapped vote items', async () => {
      const mockItem = {
        id: 10,
        deleted_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        vote_id: 1,
        artist_id: 100,
        group_id: 200,
        vote_total: 42,
        artist: { id: 100, name: 'Artist' },
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValue({ data: [mockItem], error: null });

      const result = await _getVoteItems(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 10,
          deletedAt: null,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          voteId: 1,
          artistId: 100,
          groupId: 200,
          voteTotal: 42,
        }),
      );
    });

    it('returns empty array when no items', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValue({ data: [], error: null });

      const result = await _getVoteItems(1);
      expect(result).toEqual([]);
    });

    it('returns empty array when data is null', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValue({ data: null, error: null });

      const result = await _getVoteItems(1);
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValue({ data: null, error: { message: 'err' } });

      const result = await _getVoteItems(1);
      expect(result).toEqual([]);
    });
  });

  describe('_getVoteRewards', () => {
    it('returns mapped reward data for a vote', async () => {
      const mockVoteReward = [{ reward_id: 5 }];
      const mockReward = {
        id: 5, title: 'Reward',
        deleted_at: null, created_at: '2024-01-01', updated_at: '2024-01-02',
        location_images: ['img1'], overview_images: ['img2'],
        size_guide: 'guide', size_guide_images: ['img3'],
      };

      // First call: vote_reward
      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ eq: mockEq });
      mockEq.mockResolvedValueOnce({ data: mockVoteReward, error: null });

      // Second call: reward
      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ in: mockIn });
      mockIn.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValueOnce({ data: [mockReward], error: null });

      const result = await _getVoteRewards(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 5,
          deletedAt: null,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          locationImages: ['img1'],
          overviewImages: ['img2'],
          sizeGuide: 'guide',
          sizeGuideImages: ['img3'],
        }),
      );
    });

    it('returns empty array when no vote rewards', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockResolvedValue({ data: [], error: null });

      const result = await _getVoteRewards(1);
      expect(result).toEqual([]);
    });

    it('returns empty array when vote rewards data is null', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockResolvedValue({ data: null, error: null });

      const result = await _getVoteRewards(1);
      expect(result).toEqual([]);
    });

    it('returns empty array on vote_reward fetch error', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockResolvedValue({ data: null, error: { message: 'err' } });

      const result = await _getVoteRewards(1);
      expect(result).toEqual([]);
    });

    it('returns empty array when reward data is empty', async () => {
      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ eq: mockEq });
      mockEq.mockResolvedValueOnce({ data: [{ reward_id: 5 }], error: null });

      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ in: mockIn });
      mockIn.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValueOnce({ data: [], error: null });

      const result = await _getVoteRewards(1);
      expect(result).toEqual([]);
    });

    it('returns empty array when reward data is null', async () => {
      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ eq: mockEq });
      mockEq.mockResolvedValueOnce({ data: [{ reward_id: 5 }], error: null });

      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ in: mockIn });
      mockIn.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValueOnce({ data: null, error: null });

      const result = await _getVoteRewards(1);
      expect(result).toEqual([]);
    });

    it('returns empty array on reward fetch error', async () => {
      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ eq: mockEq });
      mockEq.mockResolvedValueOnce({ data: [{ reward_id: 5 }], error: null });

      mockFrom.mockReturnValueOnce({ select: mockSelect });
      mockSelect.mockReturnValueOnce({ in: mockIn });
      mockIn.mockReturnValue({ is: mockIs });
      mockIs.mockResolvedValueOnce({ data: null, error: { message: 'err' } });

      const result = await _getVoteRewards(1);
      expect(result).toEqual([]);
    });
  });
});
