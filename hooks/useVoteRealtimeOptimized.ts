'use client';

import { useReducer, useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { 
  VoteRealtimeService,
  VoteRealtimeEvent, 
  ConnectionStatus,
  ConnectionInfo,
  VoteEventListener,
  ConnectionStatusListener,
  DataSyncCallback
} from '@/lib/supabase/realtime';
import { VoteItem } from '@/types/interfaces';
import { useVoteStore } from '@/stores/voteStore';
import { useDebounce } from '@/hooks';

// 스로틀링 유틸리티
function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastRunRef.current >= delay) {
      lastRunRef.current = now;
      callback(...args);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        lastRunRef.current = Date.now();
        callback(...args);
      }, delay - (now - lastRunRef.current));
    }
  }, [callback, delay]) as T;
}

// 통합 상태 타입
interface VoteRealtimeState {
  // 데이터 상태
  voteItems: VoteItem[] | null;
  totalVotes: number | null;
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  lastEvent: VoteRealtimeEvent | null;
  eventCount: number;
  
  // 연결 상태
  connectionStatus: ConnectionStatus;
  connectionInfo: ConnectionInfo;
  
  // 브라우저 상태 (통합)
  systemStatus: {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType: string | null;
    isPageVisible: boolean;
    battery: {
      isCharging: boolean | null;
      level: number | null;
      chargingTime: number | null;
      dischargingTime: number | null;
    };
  };
  
  // 설정 상태
  settings: {
    smartReconnectEnabled: boolean;
    batterySaverEnabled: boolean;
  };
}

// 액션 타입
type VoteRealtimeAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: Error | null }
  | { type: 'SET_VOTE_DATA'; payload: { voteItems: VoteItem[] | null; totalVotes: number | null } }
  | { type: 'SET_CONNECTION_STATUS'; payload: { status: ConnectionStatus; info: ConnectionInfo } }
  | { type: 'SET_EVENT'; payload: VoteRealtimeEvent }
  | { type: 'UPDATE_SYSTEM_STATUS'; payload: Partial<VoteRealtimeState['systemStatus']> }
  | { type: 'TOGGLE_SMART_RECONNECT' }
  | { type: 'TOGGLE_BATTERY_SAVER' }
  | { type: 'RESET_STATE' };

// 상태 리듀서
function voteRealtimeReducer(state: VoteRealtimeState, action: VoteRealtimeAction): VoteRealtimeState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
      
    case 'SET_ERROR':
      return { ...state, error: action.payload };
      
    case 'SET_VOTE_DATA':
      return {
        ...state,
        voteItems: action.payload.voteItems,
        totalVotes: action.payload.totalVotes,
        lastUpdated: new Date(),
        isLoading: false,
        error: null
      };
      
    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatus: action.payload.status,
        connectionInfo: {
          ...state.connectionInfo,
          ...action.payload.info
        }
      };
      
    case 'SET_EVENT':
      return {
        ...state,
        lastEvent: action.payload,
        eventCount: state.eventCount + 1,
        lastUpdated: new Date()
      };
      
    case 'UPDATE_SYSTEM_STATUS':
      return {
        ...state,
        systemStatus: {
          ...state.systemStatus,
          ...action.payload
        }
      };
      
    case 'TOGGLE_SMART_RECONNECT':
      return {
        ...state,
        settings: {
          ...state.settings,
          smartReconnectEnabled: !state.settings.smartReconnectEnabled
        }
      };
      
    case 'TOGGLE_BATTERY_SAVER':
      return {
        ...state,
        settings: {
          ...state.settings,
          batterySaverEnabled: !state.settings.batterySaverEnabled
        }
      };
      
    case 'RESET_STATE':
      return {
        ...state,
        voteItems: null,
        totalVotes: null,
        isLoading: true,
        error: null,
        lastEvent: null,
        eventCount: 0,
        connectionStatus: 'disconnected'
      };
      
    default:
      return state;
  }
}

// 초기 상태
const createInitialState = (maxRetries: number): VoteRealtimeState => ({
  voteItems: null,
  totalVotes: null,
  isLoading: true,
  error: null,
  lastUpdated: null,
  lastEvent: null,
  eventCount: 0,
  connectionStatus: 'disconnected',
  connectionInfo: {
    status: 'disconnected',
    reconnectAttempts: 0,
    maxReconnectAttempts: maxRetries,
    isOnline: typeof window !== 'undefined' && typeof navigator !== 'undefined' ? navigator.onLine : true,
    isVisible: typeof window !== 'undefined' && typeof document !== 'undefined' ? !document.hidden : true
  },
  systemStatus: {
    isOnline: typeof window !== 'undefined' && navigator ? navigator.onLine : true,
    isSlowConnection: false,
    connectionType: null,
    isPageVisible: typeof window !== 'undefined' && typeof document !== 'undefined' ? !document.hidden : true,
    battery: {
      isCharging: null,
      level: null,
      chargingTime: null,
      dischargingTime: null
    }
  },
  settings: {
    smartReconnectEnabled: true,
    batterySaverEnabled: true
  }
});

// 훅 옵션 (기존과 동일)
export interface UseVoteRealtimeOptimizedOptions {
  voteId?: number;
  artistVoteId?: number;
  enabled?: boolean;
  pollingInterval?: number;
  enableDataSync?: boolean;
  maxRetries?: number;
  enableSmartReconnect?: boolean;
  enableBatterySaver?: boolean;
  onConnectionStatusChange?: (status: ConnectionStatus, info: ConnectionInfo) => void;
  onVoteUpdate?: (event: VoteRealtimeEvent) => void;
  onError?: (error: Error) => void;
}

// 훅 반환 타입
export interface UseVoteRealtimeOptimizedReturn {
  // 데이터
  voteItems: VoteItem[] | null;
  totalVotes: number | null;
  isLoading: boolean;
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  connectionInfo: ConnectionInfo;
  realtimeService: VoteRealtimeService | null;
  lastUpdated: Date | null;
  error: Error | null;
  lastEvent: VoteRealtimeEvent | null;
  eventCount: number;
  
  // 시스템 상태 (최적화됨)
  systemStatus: VoteRealtimeState['systemStatus'];
  
  // 액션
  manualReconnect: () => void;
  refreshData: () => Promise<void>;
  toggleSmartReconnect: () => void;
  toggleBatterySaver: () => void;
  
  // 성능 메트릭
  performanceMetrics: {
    renderCount: number;
    lastRenderTime: number;
    memoryUsage: number | null;
  };
}

/**
 * 성능 최적화된 실시간 투표 훅
 */
export function useVoteRealtimeOptimized(
  options: UseVoteRealtimeOptimizedOptions = {}
): UseVoteRealtimeOptimizedReturn {
  const {
    voteId,
    artistVoteId,
    enabled = true,
    pollingInterval = 30000,
    enableDataSync = true,
    maxRetries = 10,
    enableSmartReconnect = true,
    enableBatterySaver = true,
    onConnectionStatusChange,
    onVoteUpdate,
    onError
  } = options;

  // 상태 관리 (useReducer로 최적화)
  const [state, dispatch] = useReducer(
    voteRealtimeReducer,
    useMemo(() => createInitialState(maxRetries), [maxRetries])
  );

  // 렌더 카운트 추적
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(Date.now());
  
  useEffect(() => {
    renderCountRef.current += 1;
    lastRenderTimeRef.current = Date.now();
  });

  // 메모리 사용량 추적
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);
  
  const updateMemoryUsage = useCallback(() => {
    if (typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any)) {
      const memory = (window.performance as any).memory;
      setMemoryUsage(memory.usedJSHeapSize);
    }
  }, []);

  // 서비스 및 리스너 참조
  const serviceRef = useRef<VoteRealtimeService | null>(null);
  const eventListenerRef = useRef<VoteEventListener | null>(null);
  const statusListenerRef = useRef<ConnectionStatusListener | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Vote 스토어 접근
  const { loadVoteResults } = useVoteStore();

  // 디바운스된 상태 업데이트 (잦은 업데이트 방지)
  const debouncedUpdateSystemStatus = useDebounce(
    useCallback((updates: Partial<VoteRealtimeState['systemStatus']>) => {
      dispatch({ type: 'UPDATE_SYSTEM_STATUS', payload: updates });
    }, [dispatch]),
    500
  );

  // 스로틀된 상태 업데이트 (UI 부하 감소)
  const throttledEventHandler = useThrottle(
    useCallback((event: VoteRealtimeEvent) => {
      dispatch({ type: 'SET_EVENT', payload: event });
      onVoteUpdate?.(event);
    }, [onVoteUpdate]),
    1000
  );

  // 네트워크 상태 업데이트 (메모화)
  const updateNetworkStatus = useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const isOnline = navigator.onLine;
    let connectionType = null;
    let isSlowConnection = false;

    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connectionType = connection?.effectiveType || connection?.type || null;
      isSlowConnection = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
    }

    debouncedUpdateSystemStatus({ isOnline, isSlowConnection, connectionType });
  }, [debouncedUpdateSystemStatus]);

  // 배터리 상태 업데이트 (메모화)
  const updateBatteryStatus = useCallback(async () => {
    if (typeof window === 'undefined' || !('getBattery' in navigator)) return;

    try {
      const battery = await (navigator as any).getBattery();
      
      debouncedUpdateSystemStatus({
        battery: {
          isCharging: battery.charging,
          level: battery.level,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime
        }
      });
    } catch (error) {
      console.warn('[useVoteRealtimeOptimized] 배터리 상태 조회 실패:', error);
    }
  }, [debouncedUpdateSystemStatus]);

  // 페이지 가시성 업데이트 (메모화)
  const updatePageVisibility = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isPageVisible = !document.hidden;
    debouncedUpdateSystemStatus({ isPageVisible });
  }, [debouncedUpdateSystemStatus]);

  // 재연결 조건 확인 (메모화)
  const shouldReconnect = useMemo(() => {
    if (!state.settings.smartReconnectEnabled) return true;

    const { systemStatus, settings } = state;
    
    if (!systemStatus.isPageVisible || !systemStatus.isOnline) return false;
    
    if (settings.batterySaverEnabled && 
        systemStatus.battery.level !== null && 
        !systemStatus.battery.isCharging && 
        systemStatus.battery.level < 0.15) {
      return false;
    }
    
    if (systemStatus.isSlowConnection) return false;
    
    return true;
  }, [state.settings, state.systemStatus]);

  // 데이터 새로고침 (메모화)
  const refreshData = useCallback(async () => {
    if (!voteId) return;
    
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await loadVoteResults(voteId);
      const currentResults = useVoteStore.getState().results;
      
      dispatch({
        type: 'SET_VOTE_DATA',
        payload: {
          voteItems: currentResults.voteItems,
          totalVotes: currentResults.totalVotes
        }
      });
      
      // 메모리 사용량 업데이트
      updateMemoryUsage();
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('투표 데이터 로드 실패');
      dispatch({ type: 'SET_ERROR', payload: error });
      onError?.(error);
    }
  }, [voteId, loadVoteResults, onError, updateMemoryUsage]);

  // 이벤트 리스너 생성 (메모화)
  const createEventListener = useCallback((): VoteEventListener => {
    return (event: VoteRealtimeEvent) => {
      throttledEventHandler(event);
      
      if (event.type === 'vote_item_updated' || event.type === 'vote_pick_created') {
        refreshData().catch(console.error);
      }
    };
  }, [throttledEventHandler, refreshData]);

  // 연결 상태 리스너 생성 (메모화)
  const createStatusListener = useCallback((): ConnectionStatusListener => {
    return (status: ConnectionStatus, info: ConnectionInfo) => {
      dispatch({
        type: 'SET_CONNECTION_STATUS',
        payload: { status, info }
      });
      
      onConnectionStatusChange?.(status, info);
      
      if ((status === 'error' || status === 'network_error') && shouldReconnect) {
        const delay = state.systemStatus.isSlowConnection ? 10000 : 1000;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (serviceRef.current && shouldReconnect) {
            serviceRef.current.manualReconnect();
          }
        }, delay);
      }
    };
  }, [onConnectionStatusChange, shouldReconnect, state.systemStatus.isSlowConnection]);

  // 실시간 서비스 초기화 (useEffect)
  useEffect(() => {
    if (!enabled || !voteId) return;

    const initializeService = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        
        // 서비스 생성 (기존 싱글톤 서비스 사용)
        const { getVoteRealtimeService } = await import('@/lib/supabase/realtime');
        const service = getVoteRealtimeService();
        
        serviceRef.current = service;
        
        // 이벤트 리스너 설정
        eventListenerRef.current = createEventListener();
        statusListenerRef.current = createStatusListener();
        
        service.addEventListener(eventListenerRef.current);
        service.addStatusListener(statusListenerRef.current);
        
        // 데이터 동기화 콜백 설정
        service.addDataSyncCallback(voteId, async () => {
          await refreshData();
        });
        
        // 초기 데이터 로드
        await refreshData();
        
        // 투표 구독 시작
        service.subscribeToVote(voteId);
        
        // Artist 투표가 있으면 함께 구독
        if (artistVoteId) {
          service.subscribeToArtistVote(artistVoteId);
        }
        
      } catch (error) {
        console.error('[useVoteRealtimeOptimized] 서비스 초기화 실패:', error);
        dispatch({ 
          type: 'SET_ERROR', 
          payload: error instanceof Error ? error : new Error('서비스 초기화 실패') 
        });
      }
    };

    initializeService();

    // 클린업
    return () => {
      if (serviceRef.current) {
        if (eventListenerRef.current) {
          serviceRef.current.removeEventListener(eventListenerRef.current);
        }
        if (statusListenerRef.current) {
          serviceRef.current.removeStatusListener(statusListenerRef.current);
        }
        
        // 데이터 동기화 콜백 제거
        serviceRef.current.removeDataSyncCallback(voteId);
        
        // 구독 해제
        serviceRef.current.unsubscribeFromVote(voteId);
        if (artistVoteId) {
          serviceRef.current.unsubscribeFromArtistVote(artistVoteId);
        }
        
        serviceRef.current = null;
      }
      
      // 타이머 정리
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [
    enabled, 
    voteId,
    artistVoteId,
    createEventListener,
    createStatusListener,
    refreshData
  ]);

  // 브라우저 이벤트 리스너 설정 (성능 최적화됨)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 네트워크 상태 변경 감지
    const handleOnline = () => updateNetworkStatus();
    const handleOffline = () => updateNetworkStatus();
    const handleConnectionChange = () => updateNetworkStatus();

    // 페이지 가시성 변경 감지
    const handleVisibilityChange = () => updatePageVisibility();

    // 이벤트 리스너 등록
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    if ('connection' in navigator) {
      (navigator as any).connection?.addEventListener('change', handleConnectionChange);
    }

    // 초기 상태 설정
    updateNetworkStatus();
    updatePageVisibility();
    updateBatteryStatus();

    // 주기적 메모리 사용량 체크 (60초마다)
    const memoryCheckInterval = setInterval(updateMemoryUsage, 60000);

    // 클린업
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if ('connection' in navigator) {
        (navigator as any).connection?.removeEventListener('change', handleConnectionChange);
      }
      
      clearInterval(memoryCheckInterval);
    };
  }, [updateNetworkStatus, updatePageVisibility, updateBatteryStatus, updateMemoryUsage]);

  // 스마트 재연결 로직
  useEffect(() => {
    if (!serviceRef.current) return;

    const currentStatus = state.connectionStatus;
    
    // 연결이 끊어진 상태에서 재연결 조건이 충족되면 재연결 시도
    if (currentStatus === 'disconnected' || currentStatus === 'error' || currentStatus === 'network_error') {
      if (shouldReconnect) {
        const delay = state.systemStatus.isSlowConnection ? 5000 : 1000;
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (serviceRef.current && shouldReconnect) {
            serviceRef.current.manualReconnect();
          }
        }, delay);
      }
    }
  }, [shouldReconnect, state.connectionStatus, state.systemStatus.isSlowConnection]);

  return {
    // 데이터
    voteItems: state.voteItems,
    totalVotes: state.totalVotes,
    isLoading: state.isLoading,
    connectionStatus: state.connectionStatus,
    isConnected: state.connectionStatus === 'connected',
    connectionInfo: state.connectionInfo,
    realtimeService: serviceRef.current,
    lastUpdated: state.lastUpdated,
    error: state.error,
    lastEvent: state.lastEvent,
    eventCount: state.eventCount,
    
    // 시스템 상태
    systemStatus: state.systemStatus,
    
    // 액션 (메모화됨)
    manualReconnect: useCallback(() => {
      if (serviceRef.current) {
        serviceRef.current.manualReconnect();
      }
    }, []),
    
    refreshData,
    
    toggleSmartReconnect: useCallback(() => {
      dispatch({ type: 'TOGGLE_SMART_RECONNECT' });
    }, []),
    
    toggleBatterySaver: useCallback(() => {
      dispatch({ type: 'TOGGLE_BATTERY_SAVER' });
    }, []),
    
    // 성능 메트릭
    performanceMetrics: {
      renderCount: renderCountRef.current,
      lastRenderTime: lastRenderTimeRef.current,
      memoryUsage
    }
  };
} 