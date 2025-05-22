/**
 * 데이터 페칭 유틸리티 테스트
 */

import { fetchFromSupabase, fetchById, fetchList, fetchApi } from '@/lib/data-fetching/fetchers';

// supabase-server-client 모킹
jest.mock('@/utils/supabase-server-client', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: { id: '1', name: 'Test Item' }, error: null })),
        })),
      })),
    })),
  })),
}));

// next/navigation 모킹
jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

// fetch 모킹
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'test data' }),
  })
) as jest.Mock;

describe('데이터 페칭 유틸리티', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchFromSupabase', () => {
    it('성공적으로 데이터를 조회한다', async () => {
      const mockData = { id: '1', name: 'Test' };
      const mockQueryBuilder = jest.fn().mockResolvedValue({ data: mockData, error: null });

      const result = await fetchFromSupabase(mockQueryBuilder);
      expect(result).toEqual(mockData);
    });

    it('오류가 발생하면 예외를 던진다', async () => {
      const mockError = { message: '데이터 조회 오류' };
      const mockQueryBuilder = jest.fn().mockResolvedValue({ data: null, error: mockError });

      await expect(fetchFromSupabase(mockQueryBuilder)).rejects.toThrow(mockError.message);
    });

    it('데이터가 없으면 null을 반환한다', async () => {
      const mockQueryBuilder = jest.fn().mockResolvedValue({ data: null, error: null });
      const result = await fetchFromSupabase(mockQueryBuilder);
      expect(result).toBeNull();
    });

    it('배열 타입의 데이터가 없으면 빈 배열을 반환한다', async () => {
      const mockQueryBuilder = jest.fn().mockResolvedValue({ data: null, error: null });
      const result = await fetchFromSupabase<any[]>(mockQueryBuilder);
      expect(result).toEqual([]);
    });
  });

  describe('fetchById', () => {
    it('ID로 단일 항목을 조회한다', async () => {
      const result = await fetchById('users', '1');
      expect(result).toEqual({ id: '1', name: 'Test Item' });
    });
  });

  describe('fetchApi', () => {
    it('성공적으로 외부 API를 호출한다', async () => {
      const result = await fetchApi('https://api.example.com/data');
      expect(result).toEqual({ data: 'test data' });
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
        cache: 'force-cache',
        next: {
          revalidate: 60,
          tags: undefined,
        },
      });
    });

    it('API 응답이 실패하면 예외를 던진다', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        })
      );

      await expect(fetchApi('https://api.example.com/notfound')).rejects.toThrow('API 요청 실패: 404');
    });

    it('캐시 옵션을 적용한다', async () => {
      const cacheOptions = {
        revalidate: 30,
        tags: ['tag1', 'tag2'],
        cache: 'no-store' as const,
      };

      await fetchApi('https://api.example.com/data', {}, cacheOptions);
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
        cache: 'no-store',
        next: {
          revalidate: 30,
          tags: ['tag1', 'tag2'],
        },
      });
    });
  });
}); 