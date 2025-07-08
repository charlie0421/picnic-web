'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
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

// 훅 옵션 타입
export interface UseVoteRealtimeEnhancedOptions {
  /** 투표 ID */
  voteId?: number;
  /** 아티스트 투표 ID */
  artistVoteId?: number;
  /** 실시간 기능 활성화 여부 */
  enabled?: boolean;
  /** 폴링 간격 (ms) - 실시간 연결 실패 시 폴백 */
  pollingInterval?: number;
  /** 데이터 동기화 활성화 */
  enableDataSync?: boolean;
  /** 최대 재연결 시도 횟수 */
  maxRetries?: number;
  /** 스마트 재연결 활성화 (페이지 가시성, 네트워크 상태 기반) */
  enableSmartReconnect?: boolean;
  /** 배터리 절약 모드 활성화 */
  enableBatterySaver?: boolean;
  /** 연결 상태 변경 콜백 */
  onConnectionStatusChange?: (status: ConnectionStatus, info: ConnectionInfo) => void;
  /** 투표 업데이트 이벤트 콜백 */
  onVoteUpdate?: (event: VoteRealtimeEvent) => void;
  /** 오류 콜백 */
  onError?: (error: Error) => void;
}

// 훅 반환 타입
export interface UseVoteRealtimeEnhancedReturn {
  /** 투표 아이템 데이터 */
  voteItems: VoteItem[] | null;
  /** 총 투표 수 */
  totalVotes: number | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 현재 연결 상태 */
  connectionStatus: ConnectionStatus;
  /** 연결 여부 */
  isConnected: boolean;
  /** 연결 정보 */
  connectionInfo: ConnectionInfo;
  /** 실시간 서비스 인스턴스 */
  realtimeService: VoteRealtimeService | null;
  /** 마지막 업데이트 시간 */
  lastUpdated: Date | null;
  /** 오류 정보 */
  error: Error | null;
  /** 마지막 수신 이벤트 */
  lastEvent: VoteRealtimeEvent | null;
  /** 이벤트 수신 횟수 */
  eventCount: number;
  /** 네트워크 상태 */
  networkStatus: {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType: string | null;
  };
  /** 배터리 상태 */
  batteryStatus: {
    isCharging: boolean | null;
    level: number | null;
    chargingTime: number | null;
    dischargingTime: number | null;
  };
  /** 페이지 가시성 */
  isPageVisible: boolean;
  /** 수동 재연결 */
  manualReconnect: () => void;
  /** 데이터 새로고침 */
  refreshData: () => Promise<void>;
  /** 스마트 재연결 토글 */
  toggleSmartReconnect: () => void;
  /** 배터리 절약 모드 토글 */
  toggleBatterySaver: () => void;
}

/**
 * 고급 오류 처리 및 데이터 관리 기능을 포함한 실시간 투표 훅
 */
export function useVoteRealtimeEnhanced(
  options: UseVoteRealtimeEnhancedOptions = {}
): UseVoteRealtimeEnhancedReturn {
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

  // 기본 상태 관리
  const [voteItems, setVoteItems] = useState<VoteItem[] | null>(null);
  const [totalVotes, setTotalVotes] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    status: 'disconnected',
    reconnectAttempts: 0,
    maxReconnectAttempts: maxRetries,
    isOnline: typeof window !== 'undefined' && typeof navigator !== 'undefined' ? navigator.onLine : true,
    isVisible: typeof window !== 'undefined' && typeof document !== 'undefined' ? !document.hidden : true
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [lastEvent, setLastEvent] = useState<VoteRealtimeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  // 새로 추가된 상태들
  const [networkStatus, setNetworkStatus] = useState({
    isOnline: typeof window !== 'undefined' && navigator ? navigator.onLine : true,
    isSlowConnection: false,
    connectionType: null as string | null
  });

  const [batteryStatus, setBatteryStatus] = useState({
    isCharging: null as boolean | null,
    level: null as number | null,
    chargingTime: null as number | null,
    dischargingTime: null as number | null
  });

  const [isPageVisible, setIsPageVisible] = useState(
    typeof window !== 'undefined' && typeof document !== 'undefined' ? !document.hidden : true
  );

  const [smartReconnectEnabled, setSmartReconnectEnabled] = useState(enableSmartReconnect);
  const [batterySaverEnabled, setBatterySaverEnabled] = useState(enableBatterySaver);

  // 서비스 및 리스너 참조
  const serviceRef = useRef<VoteRealtimeService | null>(null);
  const eventListenerRef = useRef<VoteEventListener | null>(null);
  const statusListenerRef = useRef<ConnectionStatusListener | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Vote 스토어 접근
  const { loadVoteResults, results } = useVoteStore();

  // 네트워크 상태 감지
  const updateNetworkStatus = useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const isOnline = navigator.onLine;
    let connectionType = null;
    let isSlowConnection = false;

    // Connection API 지원 여부 확인
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connectionType = connection?.effectiveType || connection?.type || null;
      isSlowConnection = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
    }

    setNetworkStatus({ isOnline, isSlowConnection, connectionType });
    
    // ConnectionInfo 업데이트
    setConnectionInfo(prev => ({ ...prev, isOnline }));

    if (process.env.NODE_ENV === 'development') {
      console.log('[useVoteRealtimeEnhanced] 네트워크 상태 업데이트:', { isOnline, connectionType, isSlowConnection });
    }
  }, []);

  // 배터리 상태 감지
  const updateBatteryStatus = useCallback(async () => {
    if (typeof window === 'undefined' || !('getBattery' in navigator)) return;

    try {
      const battery = await (navigator as any).getBattery();
      
      setBatteryStatus({
        isCharging: battery.charging,
        level: battery.level,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 배터리 상태 업데이트:', {
          charging: battery.charging,
          level: Math.round(battery.level * 100) + '%'
        });
      }
    } catch (error) {
      console.warn('[useVoteRealtimeEnhanced] 배터리 상태 조회 실패:', error);
    }
  }, []);

  // 페이지 가시성 감지
  const updatePageVisibility = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isVisible = !document.hidden;
    setIsPageVisible(isVisible);
    
    // ConnectionInfo 업데이트
    setConnectionInfo(prev => ({ ...prev, isVisible }));

    if (process.env.NODE_ENV === 'development') {
      console.log('[useVoteRealtimeEnhanced] 페이지 가시성 변경:', isVisible);
    }
  }, []);

  // 스마트 재연결 로직
  const shouldReconnect = useCallback(() => {
    if (!smartReconnectEnabled) return true;

    // 페이지가 숨겨져 있으면 재연결하지 않음
    if (!isPageVisible) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 페이지가 숨겨져 있어 재연결 건너뜀');
      }
      return false;
    }

    // 오프라인이면 재연결하지 않음
    if (!networkStatus.isOnline) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 오프라인 상태여서 재연결 건너뜀');
      }
      return false;
    }

    // 배터리 절약 모드가 활성화되어 있고 배터리가 낮으면 재연결하지 않음
    if (batterySaverEnabled && batteryStatus.level !== null && !batteryStatus.isCharging) {
      if (batteryStatus.level < 0.15) { // 15% 미만
        if (process.env.NODE_ENV === 'development') {
          console.log('[useVoteRealtimeEnhanced] 배터리 부족으로 재연결 건너뜀');
        }
        return false;
      }
    }

    // 느린 연결에서는 재연결 간격을 늘림
    if (networkStatus.isSlowConnection) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 느린 연결 감지, 재연결 지연');
      }
      return false; // 이 경우는 별도 로직으로 처리
    }

    return true;
  }, [smartReconnectEnabled, isPageVisible, networkStatus, batterySaverEnabled, batteryStatus]);

  // 데이터 새로고침 함수
  const refreshData = useCallback(async () => {
    if (!voteId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      await loadVoteResults(voteId);
      const currentResults = useVoteStore.getState().results;
      
      setVoteItems(currentResults.voteItems);
      setTotalVotes(currentResults.totalVotes);
      setLastUpdated(new Date());
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 데이터 새로고침 완료:', currentResults.voteItems.length);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('투표 데이터 로드 실패');
      setError(error);
      onError?.(error);
      console.error('[useVoteRealtimeEnhanced] 데이터 새로고침 실패:', error);
    } finally {
      setIsLoading(false);
    }
  }, [voteId, loadVoteResults, onError]);

  // 데이터 동기화 콜백
  const dataSyncCallback: DataSyncCallback = useCallback(async (syncVoteId: number) => {
    if (syncVoteId === voteId) {
      await refreshData();
    }
  }, [voteId, refreshData]);

  // 이벤트 리스너 생성
  const createEventListener = useCallback((): VoteEventListener => {
    return (event: VoteRealtimeEvent) => {
      setLastEvent(event);
      setEventCount(prev => prev + 1);
      setLastUpdated(new Date());
      
      // 외부 콜백 호출
      onVoteUpdate?.(event);
      
      // 이벤트 타입에 따른 데이터 업데이트
      if (event.type === 'vote_item_updated' || event.type === 'vote_pick_created') {
        // 실시간 이벤트가 있으면 데이터 새로고침
        refreshData().catch(console.error);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 이벤트 수신:', event);
      }
    };
  }, [onVoteUpdate, refreshData]);

  // 연결 상태 리스너 생성
  const createStatusListener = useCallback((): ConnectionStatusListener => {
    return (status: ConnectionStatus, info: ConnectionInfo) => {
      setConnectionStatus(status);
      setConnectionInfo(prevInfo => ({
        ...prevInfo,
        ...info,
        // 기존 브라우저 상태 정보 유지
        isOnline: networkStatus.isOnline,
        isVisible: isPageVisible
      }));
      
      // 외부 콜백 호출
      onConnectionStatusChange?.(status, info);
      
      // 연결 상태가 오류인 경우 스마트 재연결 시도
      if ((status === 'error' || status === 'network_error') && shouldReconnect()) {
        const delay = networkStatus.isSlowConnection ? 10000 : 1000; // 느린 연결에서는 더 긴 지연
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (serviceRef.current && shouldReconnect()) {
            serviceRef.current.manualReconnect();
          }
        }, delay);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 연결 상태 변경:', status, info);
      }
    };
  }, [onConnectionStatusChange, networkStatus, isPageVisible, shouldReconnect]);

  // 실시간 서비스 초기화
  const initializeService = useCallback(() => {
    if (!enabled || !voteId) return;

    try {
      serviceRef.current = new VoteRealtimeService();
      
      // 최대 재연결 시도 횟수 설정
      (serviceRef.current as any).maxReconnectAttempts = maxRetries;
      
      // 리스너 등록
      eventListenerRef.current = createEventListener();
      statusListenerRef.current = createStatusListener();
      
      serviceRef.current.addEventListener(eventListenerRef.current);
      serviceRef.current.addStatusListener(statusListenerRef.current);
      
      // 데이터 동기화 콜백 등록
      if (enableDataSync) {
        serviceRef.current.addDataSyncCallback(voteId, dataSyncCallback);
      }
      
      // 구독 시작 (스마트 재연결 조건 확인)
      if (shouldReconnect()) {
        if (artistVoteId) {
          serviceRef.current.subscribeToArtistVote(artistVoteId);
        } else {
          serviceRef.current.subscribeToVote(voteId);
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtimeEnhanced] 실시간 서비스 초기화 완료');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('실시간 서비스 초기화 실패');
      setError(error);
      onError?.(error);
      console.error('[useVoteRealtimeEnhanced] 서비스 초기화 실패:', error);
    }
  }, [enabled, voteId, artistVoteId, maxRetries, createEventListener, createStatusListener, enableDataSync, dataSyncCallback, shouldReconnect, onError]);

  // 폴링 설정 (실시간 연결 실패 시 폴백)
  const setupPolling = useCallback(() => {
    if (!enabled || !voteId || pollingInterval <= 0) return;

    // 배터리 절약 모드에서는 폴링 간격을 늘림
    let adjustedInterval = pollingInterval;
    if (batterySaverEnabled && batteryStatus.level !== null && !batteryStatus.isCharging) {
      if (batteryStatus.level < 0.15) {
        adjustedInterval = pollingInterval * 3; // 3배 늘림
      } else if (batteryStatus.level < 0.3) {
        adjustedInterval = pollingInterval * 2; // 2배 늘림
      }
    }

    // 느린 연결에서는 폴링 간격을 늘림
    if (networkStatus.isSlowConnection) {
      adjustedInterval = Math.max(adjustedInterval * 2, 60000); // 최소 1분
    }

    pollingIntervalRef.current = setInterval(() => {
      // 연결이 안 되어 있고, 페이지가 보이고, 온라인인 경우만 폴링
      if (connectionStatus !== 'connected' && isPageVisible && networkStatus.isOnline) {
        refreshData().catch(console.error);
      }
    }, adjustedInterval);

    if (process.env.NODE_ENV === 'development') {
      console.log('[useVoteRealtimeEnhanced] 폴링 설정:', adjustedInterval + 'ms');
    }
  }, [enabled, voteId, pollingInterval, connectionStatus, isPageVisible, networkStatus, batterySaverEnabled, batteryStatus, refreshData]);

  // 폴링 정리
  const clearPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 서비스 정리
  const cleanupService = useCallback(() => {
    if (serviceRef.current) {
      if (eventListenerRef.current) {
        serviceRef.current.removeEventListener(eventListenerRef.current);
      }
      if (statusListenerRef.current) {
        serviceRef.current.removeStatusListener(statusListenerRef.current);
      }
      if (voteId && enableDataSync) {
        serviceRef.current.removeDataSyncCallback(voteId);
      }
      
      serviceRef.current.unsubscribeAll();
      serviceRef.current = null;
    }
    
    clearPolling();
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, [voteId, enableDataSync, clearPolling]);

  // 수동 재연결
  const manualReconnect = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.manualReconnect();
    } else {
      initializeService();
    }
  }, [initializeService]);

  // 스마트 재연결 토글
  const toggleSmartReconnect = useCallback(() => {
    setSmartReconnectEnabled(prev => !prev);
  }, []);

  // 배터리 절약 모드 토글
  const toggleBatterySaver = useCallback(() => {
    setBatterySaverEnabled(prev => !prev);
  }, []);

  // 브라우저 이벤트 리스너 설정
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 네트워크 상태 이벤트
    const handleOnline = () => {
      updateNetworkStatus();
      // 온라인이 되면 재연결 시도
      if (serviceRef.current && shouldReconnect()) {
        serviceRef.current.manualReconnect();
      }
    };
    
    const handleOffline = () => {
      updateNetworkStatus();
    };

    // 페이지 가시성 이벤트
    const handleVisibilityChange = () => {
      updatePageVisibility();
      
      // 페이지가 보이게 되면 재연결 시도
      if (!document.hidden && serviceRef.current && shouldReconnect()) {
        serviceRef.current.manualReconnect();
      }
    };

    // 네트워크 연결 변경 이벤트
    const handleConnectionChange = () => {
      updateNetworkStatus();
    };

    // 이벤트 리스너 등록
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    if ('connection' in navigator) {
      (navigator as any).connection?.addEventListener('change', handleConnectionChange);
    }

    // 초기 상태 업데이트
    updateNetworkStatus();
    updatePageVisibility();
    updateBatteryStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if ('connection' in navigator) {
        (navigator as any).connection?.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [updateNetworkStatus, updatePageVisibility, updateBatteryStatus, shouldReconnect]);

  // 초기 데이터 로드
  useEffect(() => {
    if (enabled && voteId) {
      refreshData();
    }
  }, [enabled, voteId, refreshData]);

  // 실시간 서비스 초기화
  useEffect(() => {
    if (enabled && voteId) {
      initializeService();
    }
    
    return cleanupService;
  }, [enabled, voteId, initializeService, cleanupService]);

  // 폴링 설정 (배터리 상태나 네트워크 상태 변경 시 재설정)
  useEffect(() => {
    clearPolling();
    setupPolling();
    return clearPolling;
  }, [setupPolling, clearPolling, batterySaverEnabled, batteryStatus, networkStatus]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanupService();
    };
  }, [cleanupService]);

  return {
    voteItems,
    totalVotes,
    isLoading,
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    connectionInfo,
    realtimeService: serviceRef.current,
    lastUpdated,
    error,
    lastEvent,
    eventCount,
    networkStatus,
    batteryStatus,
    isPageVisible,
    manualReconnect,
    refreshData,
    toggleSmartReconnect,
    toggleBatterySaver
  };
} 