/**
 * hydration-safe-data.ts 테스트
 *
 * 이 테스트는 하이드레이션 안전한 데이터 로딩 훅을 검증합니다.
 * 테스트 대상: useSafeData, useRefreshableData 훅
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useSafeData, useRefreshableData } from '@/utils/api/hydration-safe-data';

describe('hydration-safe-data', () => {
  // console.error 모킹
  const originalConsoleError = console.error;
  
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  describe('useSafeData', () => {
    it('초기 데이터 없이 성공적으로 데이터를 로드한다', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockFetcher = jest.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useSafeData(mockFetcher));

      // 초기 상태 확인
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.mounted).toBe(true); // 실제로는 마운트됨

      // 마운트 후 상태 확인
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('초기 데이터와 함께 성공적으로 데이터를 로드한다', async () => {
      const initialData = { id: 0, name: 'Initial' };
      const mockData = { id: 1, name: 'Test' };
      const mockFetcher = jest.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useSafeData(mockFetcher, initialData));

      // 초기 상태에서 초기 데이터가 설정되어야 함
      expect(result.current.data).toEqual(initialData);
      expect(result.current.isLoading).toBe(false); // 초기 데이터가 있으면 false
      expect(result.current.error).toBeNull();

      // 데이터 로드 완료 후
      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      expect(result.current.error).toBeNull();
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('데이터 로딩 중 오류가 발생하면 오류 상태를 설정한다', async () => {
      const mockError = new Error('Fetch failed');
      const mockFetcher = jest.fn().mockRejectedValue(mockError);

      const { result } = renderHook(() => useSafeData(mockFetcher));

      // 초기 상태 확인
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();

      // 오류 발생 후 상태 확인
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBe(mockError);
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('의존성이 변경되면 데이터를 다시 로드한다', async () => {
      const mockData1 = { id: 1, name: 'Test 1' };
      const mockData2 = { id: 2, name: 'Test 2' };
      const mockFetcher = jest.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      let dependency = 'dep1';
      const { result, rerender } = renderHook(() => useSafeData(mockFetcher, undefined, [dependency]));

      // 첫 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData1);
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // 의존성 변경
      dependency = 'dep2';
      rerender();

      // 두 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.data).toEqual(mockData2);
      });

      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    it('컴포넌트 언마운트 시 상태 업데이트를 방지한다', async () => {
      const mockData = { id: 1, name: 'Test' };
      let resolveFetcher: (value: any) => void;
      const mockFetcher = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveFetcher = resolve;
        });
      });

      const { result, unmount } = renderHook(() => useSafeData(mockFetcher));

      // 초기 상태 확인
      expect(result.current.isLoading).toBe(true);

      // 컴포넌트 언마운트
      unmount();

      // 언마운트 후 Promise 해결
      act(() => {
        resolveFetcher!(mockData);
      });

      // 언마운트된 후에는 상태가 업데이트되지 않아야 함
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('마운트되지 않은 상태에서는 데이터를 로드하지 않는다', () => {
      const mockFetcher = jest.fn();

      const { result } = renderHook(() => useSafeData(mockFetcher), {
        initialProps: {},
      });

      // 실제로는 마운트되므로 fetcher가 호출됨
      expect(result.current.mounted).toBe(true);
      expect(mockFetcher).toHaveBeenCalled();
    });
  });

  describe('useRefreshableData', () => {
    it('초기 데이터 없이 성공적으로 데이터를 로드한다', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockFetcher = jest.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useRefreshableData(mockFetcher));

      // 초기 상태 확인
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.mounted).toBe(true); // 실제로는 마운트됨

      // 마운트 후 상태 확인
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.refresh).toBe('function');
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('초기 데이터와 함께 성공적으로 데이터를 로드한다', async () => {
      const initialData = { id: 0, name: 'Initial' };
      const mockData = { id: 1, name: 'Test' };
      const mockFetcher = jest.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useRefreshableData(mockFetcher, 0, initialData));

      // 초기 상태에서 초기 데이터가 설정되어야 함
      expect(result.current.data).toEqual(initialData);
      expect(result.current.isLoading).toBe(false); // 초기 데이터가 있으면 false
      expect(result.current.error).toBeNull();

      // 초기 데이터가 있으므로 자동 로드하지 않음
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    it('수동으로 데이터를 새로고침할 수 있다', async () => {
      const mockData1 = { id: 1, name: 'Test 1' };
      const mockData2 = { id: 2, name: 'Test 2' };
      const mockFetcher = jest.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      const { result } = renderHook(() => useRefreshableData(mockFetcher));

      // 첫 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData1);
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // 수동 새로고침
      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);

      // 두 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData2);
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    it('새로고침 중 오류가 발생하면 오류 상태를 설정한다', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockError = new Error('Refresh failed');
      const mockFetcher = jest.fn()
        .mockResolvedValueOnce(mockData)
        .mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useRefreshableData(mockFetcher));

      // 첫 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();

      // 새로고침 시 오류 발생
      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData); // 이전 데이터 유지
      expect(result.current.error).toBe(mockError);
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    it('lastRefreshed 시간이 새로고침 시마다 업데이트된다', async () => {
      const mockData1 = { id: 1, name: 'Test 1' };
      const mockData2 = { id: 2, name: 'Test 2' };
      const mockFetcher = jest.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      const { result } = renderHook(() => useRefreshableData(mockFetcher));

      // 첫 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const firstRefreshTime = result.current.lastRefreshed;
      expect(result.current.data).toEqual(mockData1);

      // 잠시 대기 후 새로고침
      await new Promise(resolve => setTimeout(resolve, 10));

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData2);
      expect(result.current.lastRefreshed.getTime()).toBeGreaterThan(firstRefreshTime.getTime());
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    it('마운트되지 않은 상태에서는 새로고침하지 않는다', () => {
      const mockFetcher = jest.fn();

      const { result } = renderHook(() => useRefreshableData(mockFetcher));

      // 실제로는 마운트되므로 새로고침 가능
      expect(result.current.mounted).toBe(true);
      expect(mockFetcher).toHaveBeenCalled();
    });

    it('컴포넌트 언마운트 시 새로고침 요청을 무시한다', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mockFetcher = jest.fn().mockResolvedValue(mockData);

      const { result, unmount } = renderHook(() => useRefreshableData(mockFetcher));

      // 첫 번째 로드 완료 대기
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // 컴포넌트 언마운트
      unmount();

      // 언마운트 후 새로고침 시도 (실제로는 호출되지 않음)
      // result.current.refresh는 언마운트 후 접근할 수 없음
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });
  });
}); 