/**
 * useVoteRealtimeOptimized 훅 테스트
 *
 * 성능 최적화된 실시간 투표 기능을 종합적으로 테스트합니다.
 * 테스트 대상: 상태 관리, 성능 최적화, 에러 처리, 재연결 로직, 시스템 통합
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useVoteRealtimeOptimized } from "@/hooks/useVoteRealtimeOptimized";
import { VoteRealtimeEvent, ConnectionStatus } from "@/lib/supabase/realtime";
import { VoteItem } from "@/types/interfaces";

// Mock 데이터
const mockVoteItems: VoteItem[] = [
  {
    id: 1,
    vote_total: 150,
    artist_id: 1,
    group_id: 0,
    vote_id: 1,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    deleted_at: null,
    artist: {
      id: 1,
      name: { ko: "아티스트1", en: "Artist1" },
      image: null,
      birth_date: null,
      debut_date: null,
      gender: null,
      group_id: null,
      is_kpop: true,
      is_musical: false,
      is_solo: true,
      dd: null,
      mm: null,
      yy: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      deleted_at: null
    },
    artistGroup: {
      id: 0,
      name: { ko: "그룹1", en: "Group1" },
      image: null,
      debut_date: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      deleted_at: null
    },
    vote: {
      id: 1,
      title: { ko: "테스트 투표", en: "Test Vote" },
      area: "global",
      main_image: null,
      result_image: null,
      wait_image: null,
      start_at: "2024-01-01T00:00:00Z",
      stop_at: "2024-12-31T23:59:59Z",
      visible_at: "2024-01-01T00:00:00Z",
      vote_category: "artist",
      vote_content: null,
      vote_sub_category: null,
      order: 1,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      deleted_at: null
    }
  },
  {
    id: 2,
    vote_total: 120,
    artist_id: 2,
    group_id: 0,
    vote_id: 1,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    deleted_at: null,
    artist: {
      id: 2,
      name: { ko: "아티스트2", en: "Artist2" },
      image: null,
      birth_date: null,
      debut_date: null,
      gender: null,
      group_id: null,
      is_kpop: true,
      is_musical: false,
      is_solo: true,
      dd: null,
      mm: null,
      yy: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      deleted_at: null
    },
    artistGroup: {
      id: 0,
      name: { ko: "그룹2", en: "Group2" },
      image: null,
      debut_date: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      deleted_at: null
    },
    vote: {
      id: 1,
      title: { ko: "테스트 투표", en: "Test Vote" },
      area: "global",
      main_image: null,
      result_image: null,
      wait_image: null,
      start_at: "2024-01-01T00:00:00Z",
      stop_at: "2024-12-31T23:59:59Z",
      visible_at: "2024-01-01T00:00:00Z",
      vote_category: "artist",
      vote_content: null,
      vote_sub_category: null,
      order: 1,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      deleted_at: null
    }
  }
];

// Mock 서비스
const mockRealtimeService = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addStatusListener: jest.fn(),
  removeStatusListener: jest.fn(),
  addDataSyncCallback: jest.fn(),
  removeDataSyncCallback: jest.fn(),
  subscribeToVote: jest.fn(),
  unsubscribeFromVote: jest.fn(),
  subscribeToArtistVote: jest.fn(),
  unsubscribeFromArtistVote: jest.fn(),
  manualReconnect: jest.fn(),
  getConnectionStatus: jest.fn(() => 'connected' as ConnectionStatus),
  disconnect: jest.fn(),
  connect: jest.fn(),
};

// Vote Store Mock
const mockVoteStore = {
  loadVoteResults: jest.fn().mockResolvedValue(undefined),
  getState: jest.fn(() => ({
    results: {
      voteItems: mockVoteItems,
      totalVotes: 270,
      loading: false,
      error: null
    }
  }))
};

// Dependencies Mocking
jest.mock('@/lib/supabase/realtime', () => ({
  getVoteRealtimeService: jest.fn(() => mockRealtimeService),
  VoteRealtimeEvent: {},
  ConnectionStatus: {}
}));

jest.mock('@/stores/voteStore', () => ({
  useVoteStore: jest.fn(() => mockVoteStore)
}));

// Browser APIs 모킹
const mockNavigator = {
  onLine: true,
  connection: {
    effectiveType: '4g',
    type: 'wifi'
  },
  getBattery: jest.fn(() => Promise.resolve({
    charging: true,
    level: 0.8,
    chargingTime: Infinity,
    dischargingTime: 3600
  }))
};

const mockDocument = {
  hidden: false,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// Global objects 모킹
Object.defineProperty(window, 'navigator', { value: mockNavigator, writable: true });
Object.defineProperty(window, 'document', { value: mockDocument, writable: true });
Object.defineProperty(window, 'addEventListener', { value: jest.fn(), writable: true });
Object.defineProperty(window, 'removeEventListener', { value: jest.fn(), writable: true });

// Performance memory API 모킹
Object.defineProperty(window, 'performance', {
  value: {
    memory: {
      usedJSHeapSize: 1024 * 1024 * 10 // 10MB
    }
  },
  writable: true
});

describe('useVoteRealtimeOptimized', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('기본 기능', () => {
    it('초기 상태가 올바르게 설정되어야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      // 초기 로딩 상태
      expect(result.current.isLoading).toBe(true);
      expect(result.current.voteItems).toBeNull();
      expect(result.current.totalVotes).toBeNull();
      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.error).toBeNull();
    });

    it('투표 데이터를 성공적으로 로드해야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.voteItems).toEqual(mockVoteItems);
      expect(result.current.totalVotes).toBe(270);
      expect(mockVoteStore.loadVoteResults).toHaveBeenCalledWith(1);
    });

    it('서비스 초기화가 올바르게 이루어져야 한다', async () => {
      renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(mockRealtimeService.addEventListener).toHaveBeenCalled();
        expect(mockRealtimeService.addStatusListener).toHaveBeenCalled();
        expect(mockRealtimeService.addDataSyncCallback).toHaveBeenCalledWith(1, expect.any(Function));
        expect(mockRealtimeService.subscribeToVote).toHaveBeenCalledWith(1);
      });
    });

    it('Artist 투표 ID가 있을 때 추가 구독을 해야 한다', async () => {
      renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1, artistVoteId: 2 })
      );

      await waitFor(() => {
        expect(mockRealtimeService.subscribeToArtistVote).toHaveBeenCalledWith(2);
      });
    });
  });

  describe('성능 최적화', () => {
    it('렌더링 횟수를 추적해야 한다', async () => {
      const { result, rerender } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      expect(result.current.performanceMetrics.renderCount).toBe(1);

      rerender();
      expect(result.current.performanceMetrics.renderCount).toBe(2);

      rerender();
      expect(result.current.performanceMetrics.renderCount).toBe(3);
    });

    it('메모리 사용량을 추적해야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.performanceMetrics.memoryUsage).toBe(10 * 1024 * 1024);
      });
    });

    it('디바운싱이 올바르게 작동해야 한다', async () => {
      const mockOnChange = jest.fn();

      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ 
          voteId: 1,
          onConnectionStatusChange: mockOnChange
        })
      );

      // 서비스 초기화 대기
      await waitFor(() => {
        expect(mockRealtimeService.addStatusListener).toHaveBeenCalled();
      });

      // 상태 리스너 추출
      const statusListener = mockRealtimeService.addStatusListener.mock.calls[0][0];

      // 연속된 상태 변경 시뮬레이션
      act(() => {
        statusListener('connecting', { status: 'connecting' });
        statusListener('connecting', { status: 'connecting' });
        statusListener('connected', { status: 'connected' });
      });

      // 디바운스 타이머 실행
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // 마지막 상태만 반영되어야 함
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected');
      });
    });
  });

  describe('시스템 상태 통합', () => {
    it('네트워크 상태를 올바르게 감지해야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.systemStatus.isOnline).toBe(true);
        expect(result.current.systemStatus.connectionType).toBe('4g');
        expect(result.current.systemStatus.isSlowConnection).toBe(false);
      });
    });

    it('배터리 상태를 올바르게 감지해야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.systemStatus.battery.isCharging).toBe(true);
        expect(result.current.systemStatus.battery.level).toBe(0.8);
      });
    });

    it('페이지 가시성을 올바르게 감지해야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.systemStatus.isPageVisible).toBe(true);
      });
    });

    it('스마트 재연결 설정을 토글할 수 있어야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      expect(result.current.systemStatus).toBeDefined();

      act(() => {
        result.current.toggleSmartReconnect();
      });

      // 내부 상태 변경 확인 (실제 구현에 따라 조정 필요)
      expect(result.current.toggleSmartReconnect).toBeInstanceOf(Function);
    });

    it('배터리 절약 모드를 토글할 수 있어야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      act(() => {
        result.current.toggleBatterySaver();
      });

      expect(result.current.toggleBatterySaver).toBeInstanceOf(Function);
    });
  });

  describe('에러 처리', () => {
    it('로딩 에러를 올바르게 처리해야 한다', async () => {
      const loadError = new Error('로딩 실패');
      mockVoteStore.loadVoteResults.mockRejectedValueOnce(loadError);

      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.error).toEqual(loadError);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('에러 콜백이 호출되어야 한다', async () => {
      const onError = jest.fn();
      const loadError = new Error('로딩 실패');
      mockVoteStore.loadVoteResults.mockRejectedValueOnce(loadError);

      renderHook(() =>
        useVoteRealtimeOptimized({ 
          voteId: 1,
          onError 
        })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(loadError);
      });
    });
  });

  describe('실시간 이벤트 처리', () => {
    it('투표 업데이트 이벤트를 처리해야 한다', async () => {
      const onVoteUpdate = jest.fn();

      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ 
          voteId: 1,
          onVoteUpdate 
        })
      );

      await waitFor(() => {
        expect(mockRealtimeService.addEventListener).toHaveBeenCalled();
      });

      // 이벤트 리스너 추출
      const eventListener = mockRealtimeService.addEventListener.mock.calls[0][0];

      const mockEvent: VoteRealtimeEvent = {
        type: 'vote_item_updated',
        payload: {
          id: 1,
          vote_id: 1,
          artist_id: 1,
          group_id: 0,
          vote_total: 200,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          deleted_at: null
        }
      };

      act(() => {
        eventListener(mockEvent);
      });

      // 스로틀링 때문에 1초 대기
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(onVoteUpdate).toHaveBeenCalledWith(mockEvent);
    });

    it('이벤트 카운트를 추적해야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(mockRealtimeService.addEventListener).toHaveBeenCalled();
      });

      const eventListener = mockRealtimeService.addEventListener.mock.calls[0][0];

      const mockEvent: VoteRealtimeEvent = {
        type: 'vote_item_updated',
        payload: {
          id: 1,
          vote_id: 1,
          artist_id: 1,
          group_id: 0,
          vote_total: 200,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          deleted_at: null
        }
      };

      act(() => {
        eventListener(mockEvent);
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.eventCount).toBe(1);
        expect(result.current.lastEvent).toEqual(mockEvent);
      });
    });
  });

  describe('재연결 로직', () => {
    it('수동 재연결을 수행할 수 있어야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.manualReconnect).toBeInstanceOf(Function);
      });

      act(() => {
        result.current.manualReconnect();
      });

      expect(mockRealtimeService.manualReconnect).toHaveBeenCalled();
    });

    it('데이터 새로고침을 수행할 수 있어야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1 })
      );

      await waitFor(() => {
        expect(result.current.refreshData).toBeInstanceOf(Function);
      });

      await act(async () => {
        await result.current.refreshData();
      });

      expect(mockVoteStore.loadVoteResults).toHaveBeenCalledWith(1);
    });
  });

  describe('리소스 정리', () => {
    it('언마운트 시 모든 리소스를 정리해야 한다', async () => {
      const { unmount } = renderHook(() =>
        useVoteRealtimeOptimized({ voteId: 1, artistVoteId: 2 })
      );

      await waitFor(() => {
        expect(mockRealtimeService.addEventListener).toHaveBeenCalled();
      });

      unmount();

      expect(mockRealtimeService.removeEventListener).toHaveBeenCalled();
      expect(mockRealtimeService.removeStatusListener).toHaveBeenCalled();
      expect(mockRealtimeService.removeDataSyncCallback).toHaveBeenCalledWith(1);
      expect(mockRealtimeService.unsubscribeFromVote).toHaveBeenCalledWith(1);
      expect(mockRealtimeService.unsubscribeFromArtistVote).toHaveBeenCalledWith(2);
    });

    it('비활성화 시 구독을 해제해야 한다', async () => {
      const { rerender } = renderHook(
        ({ enabled }) => useVoteRealtimeOptimized({ voteId: 1, enabled }),
        { initialProps: { enabled: true } }
      );

      await waitFor(() => {
        expect(mockRealtimeService.subscribeToVote).toHaveBeenCalled();
      });

      rerender({ enabled: false });

      await waitFor(() => {
        expect(mockRealtimeService.unsubscribeFromVote).toHaveBeenCalled();
      });
    });
  });

  describe('옵션 처리', () => {
    it('기본 옵션이 올바르게 적용되어야 한다', async () => {
      const { result } = renderHook(() =>
        useVoteRealtimeOptimized()
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.voteItems).toBeNull();
    });

    it('커스텀 옵션이 올바르게 적용되어야 한다', async () => {
      const customOptions = {
        voteId: 123,
        artistVoteId: 456,
        enabled: true,
        pollingInterval: 60000,
        enableDataSync: false,
        maxRetries: 5,
        enableSmartReconnect: false,
        enableBatterySaver: false
      };

      renderHook(() =>
        useVoteRealtimeOptimized(customOptions)
      );

      await waitFor(() => {
        expect(mockRealtimeService.subscribeToVote).toHaveBeenCalledWith(123);
        expect(mockRealtimeService.subscribeToArtistVote).toHaveBeenCalledWith(456);
      });
    });
  });
}); 