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

// Mock Supabase client
const mockSelect = vi.fn();
const mockIs = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockLte = vi.fn();
const mockOr = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock('@/utils/api/retry-utils', () => ({
  withRetry: vi.fn((fn: any, _opts: any) => fn),
}));

vi.mock('@/utils/api/queries-helpers', () => ({
  FALLBACK_REWARDS: [{ id: -1, title: 'fallback' }],
  GET_REWARDS_TIMEOUT_MS: 7000,
  DEFAULT_REWARD_LIMIT: 24,
  REWARD_SELECT_COLUMNS: 'id,title',
  FALLBACK_VOTES: [],
  withTimeout: vi.fn(async (promise: Promise<any>, _fallback: any, _label: string, _timeout?: number) => {
    return promise;
  }),
  withDeadline: vi.fn(async (run: (signal: AbortSignal) => Promise<any>, _label: string, _timeout?: number) =>
    run(new AbortController().signal),
  ),
  logRequestError: vi.fn(),
}));

import { _getRewards, _getBanners, _getRewardById, _getMedias, _getPopups } from '@/utils/api/queries-content';

function setupChain(data: any, error: any = null) {
  // Reset all mocks
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ is: mockIs });
  mockIs.mockReturnValue({ order: mockOrder, eq: mockEq, lte: mockLte });
  mockOrder.mockReturnValue({ limit: mockLimit, lte: mockLte, abortSignal: () => ({ limit: mockLimit }) });
  mockLimit.mockResolvedValue({ data, error });
  mockEq.mockReturnValue({ is: mockIs, lte: mockLte, order: mockOrder });
  mockLte.mockReturnValue({ or: mockOr, order: mockOrder });
  mockOr.mockReturnValue({ order: mockOrder });
  mockSingle.mockResolvedValue({ data, error });

  // For single queries
  mockIs.mockReturnValue({ order: mockOrder, eq: mockEq, single: mockSingle, lte: mockLte });
  mockEq.mockReturnValue({ is: mockIs, single: mockSingle, lte: mockLte, order: mockOrder });
}

describe('queries-content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('_getRewards', () => {
    it('returns mapped reward data when supabase returns data', async () => {
      const mockReward = {
        id: 1,
        title: 'Test Reward',
        deleted_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        location_images: ['img1'],
        overview_images: ['img2'],
        size_guide: 'guide',
        size_guide_images: ['img3'],
      };

      setupChain([mockReward]);

      const result = await _getRewards();
      expect(result).toEqual([
        expect.objectContaining({
          id: 1,
          deletedAt: null,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          locationImages: ['img1'],
          overviewImages: ['img2'],
          sizeGuide: 'guide',
          sizeGuideImages: ['img3'],
        }),
      ]);
    });

    it('returns fallback rewards when data is empty', async () => {
      setupChain([]);
      const result = await _getRewards();
      expect(result).toEqual([{ id: -1, title: 'fallback' }]);
    });

    it('returns fallback rewards when data is null', async () => {
      setupChain(null);
      const result = await _getRewards();
      expect(result).toEqual([{ id: -1, title: 'fallback' }]);
    });

    it('returns fallback when supabase throws error', async () => {
      setupChain(null, { message: 'DB error' });
      // The inner function will throw, then the outer catches and returns fallback
      const result = await _getRewards();
      expect(result).toEqual([{ id: -1, title: 'fallback' }]);
    });

    // ISR 페이지(rewards)는 폴백 샘플이 캐시에 저장되면 안 된다 — 호출자가 예외를 요구할 수 있어야 한다.
    it('rethrows a reward query error when the caller requires error visibility', async () => {
      const queryError = { message: 'DB error' };
      setupChain(null, queryError);
      await expect(_getRewards(8, { throwOnError: true })).rejects.toBe(queryError);
    });

    // 샘플 리워드(id -1)는 "조회 실패를 가리는 폴백" 이다. 예외를 요구한 호출자에게는 빈 결과를 그대로 돌려줘
    // 호출자가 빈 상태를 렌더하게 한다 — 그렇지 않으면 가짜 리워드 카드가 ISR 에 캐시된다.
    it('returns an empty list, not the sample reward, for an empty result when the caller requires error visibility', async () => {
      setupChain([]);
      await expect(_getRewards(8, { throwOnError: true })).resolves.toEqual([]);
    });

    it('returns an empty list for a null result when the caller requires error visibility', async () => {
      setupChain(null);
      await expect(_getRewards(8, { throwOnError: true })).resolves.toEqual([]);
    });

    it('accepts optional limit parameter', async () => {
      const mockReward = {
        id: 1, title: 'R', deleted_at: null, created_at: '', updated_at: '',
        location_images: null, overview_images: null, size_guide: null, size_guide_images: null,
      };
      setupChain([mockReward]);
      const result = await _getRewards(5);
      expect(result).toHaveLength(1);
    });
  });

  describe('_getBanners', () => {
    it('returns banner data on success', async () => {
      const mockBanner = { id: 1, title: 'Banner', location: 'vote_home' };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: [mockBanner], error: null });

      const result = await _getBanners();
      expect(result).toEqual([mockBanner]);
    });

    it('returns empty array when no banner data', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: [], error: null });

      const result = await _getBanners();
      expect(result).toEqual([]);
    });

    it('returns empty array when bannerData is null', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: null, error: null });

      const result = await _getBanners();
      expect(result).toEqual([]);
    });

    it('returns empty array on supabase error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await _getBanners();
      expect(result).toEqual([]);
      errorSpy.mockRestore();
    });

    it('rethrows a banner query error when the caller requires error visibility', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const queryError = { message: 'error' };
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: null, error: queryError });

      await expect(_getBanners({ throwOnError: true })).rejects.toBe(queryError);
      errorSpy.mockRestore();
    });

    it('accepts custom columns parameter', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: [{ id: 1 }], error: null });

      const result = await _getBanners({ columns: 'id,title' });
      expect(mockSelect).toHaveBeenCalledWith('id,title');
      expect(result).toEqual([{ id: 1 }]);
    });

    it('uses "*" when no columns specified', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ order: mockOrder });
      mockOrder.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockResolvedValue({ data: [], error: null });

      await _getBanners();
      expect(mockSelect).toHaveBeenCalledWith('*');
    });
  });

  describe('_getRewardById', () => {
    it('returns reward data for valid id', async () => {
      const mockReward = { id: '123', title: 'Reward' };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: mockReward, error: null });

      const result = await _getRewardById('123');
      expect(result).toEqual(mockReward);
    });

    it('returns null for empty id', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await _getRewardById('');
      expect(result).toBeNull();
      errorSpy.mockRestore();
    });

    it('returns null for whitespace-only id', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await _getRewardById('   ');
      expect(result).toBeNull();
      errorSpy.mockRestore();
    });

    it('returns null when rewardData is null', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: null, error: null });

      const result = await _getRewardById('123');
      expect(result).toBeNull();
    });

    it('returns null for PGRST116 error (no rows)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows', details: '', hint: '' } });

      const result = await _getRewardById('123');
      expect(result).toBeNull();
      errorSpy.mockRestore();
    });

    it('returns null on other supabase errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'unexpected', details: '', hint: '' } });

      const result = await _getRewardById('123');
      expect(result).toBeNull();
      errorSpy.mockRestore();
    });
  });

  describe('_getMedias', () => {
    it('returns mapped media data on success', async () => {
      const mockMedia = {
        id: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        deleted_at: null,
        thumbnail_url: 'thumb.jpg',
        video_url: 'video.mp4',
        video_id: 'v1',
        title: 'Media 1',
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [mockMedia], error: null });

      const result = await _getMedias();
      expect(result).toEqual([{
        id: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        deleted_at: null,
        thumbnail_url: 'thumb.jpg',
        video_url: 'video.mp4',
        video_id: 'v1',
        title: 'Media 1',
      }]);
    });

    it('returns empty array when no media data', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [], error: null });

      const result = await _getMedias();
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await _getMedias();
      expect(result).toEqual([]);
    });
  });

  describe('_getPopups', () => {
    it('returns mapped popup data on success', async () => {
      const mockPopup = {
        id: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        deleted_at: null,
        start_at: '2024-01-01',
        stop_at: '2024-12-31',
        image: 'img.jpg',
        content: 'content',
        platform: 'web',
        title: 'Popup 1',
      };

      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [mockPopup], error: null });

      const result = await _getPopups();
      expect(result).toEqual([
        expect.objectContaining({
          id: 1,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          deletedAt: null,
          startAt: '2024-01-01',
          stopAt: '2024-12-31',
          image: 'img.jpg',
          content: 'content',
          platform: 'web',
          title: 'Popup 1',
        }),
      ]);
    });

    it('returns empty array when no popup data', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: [], error: null });

      const result = await _getPopups();
      expect(result).toEqual([]);
    });

    it('returns empty array when popup data is null', async () => {
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: null, error: null });

      const result = await _getPopups();
      expect(result).toEqual([]);
    });

    it('returns empty array on supabase error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await _getPopups();
      expect(result).toEqual([]);
      errorSpy.mockRestore();
    });

    it('rethrows a popup query error when the caller requires error visibility', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const queryError = { message: 'error' };
      mockFrom.mockReturnValue({ select: mockSelect });
      mockSelect.mockReturnValue({ is: mockIs });
      mockIs.mockReturnValue({ lte: mockLte });
      mockLte.mockReturnValue({ or: mockOr });
      mockOr.mockReturnValue({ order: mockOrder });
      mockOrder.mockResolvedValue({ data: null, error: queryError });

      await expect(_getPopups({ throwOnError: true })).rejects.toBe(queryError);
      errorSpy.mockRestore();
    });
  });
});
