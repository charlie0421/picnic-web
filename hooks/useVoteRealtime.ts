'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { 
  getVoteRealtimeService, 
  cleanupVoteRealtime,
  VoteRealtimeEvent, 
  ConnectionStatus,
  VoteEventListener,
  ConnectionStatusListener
} from '@/lib/supabase/realtime';

// 훅 옵션 타입
interface UseVoteRealtimeOptions {
  /** 투표 ID */
  voteId?: number;
  /** 아티스트 투표 ID */
  artistVoteId?: number;
  /** 자동 연결 여부 (기본값: true) */
  autoConnect?: boolean;
  /** 컴포넌트 언마운트 시 자동 정리 여부 (기본값: true) */
  autoCleanup?: boolean;
  /** 연결 상태 변경 콜백 */
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  /** 투표 업데이트 이벤트 콜백 */
  onVoteUpdate?: (event: VoteRealtimeEvent) => void;
}

// 훅 반환 타입
interface UseVoteRealtimeReturn {
  /** 현재 연결 상태 */
  connectionStatus: ConnectionStatus;
  /** 연결 여부 */
  isConnected: boolean;
  /** 수동으로 연결 시작 */
  connect: () => void;
  /** 연결 해제 */
  disconnect: () => void;
  /** 모든 연결 해제 및 정리 */
  cleanup: () => void;
  /** 활성 구독 수 */
  activeSubscriptionsCount: number;
  /** 활성 구독 목록 */
  activeSubscriptions: string[];
  /** 마지막 수신 이벤트 */
  lastEvent: VoteRealtimeEvent | null;
  /** 이벤트 수신 횟수 */
  eventCount: number;
}

/**
 * 투표 실시간 업데이트를 위한 React 커스텀 훅
 * 
 * @param options 훅 설정 옵션
 * @returns 실시간 연결 상태 및 제어 함수들
 * 
 * @example
 * ```tsx
 * function VoteComponent({ voteId }: { voteId: number }) {
 *   const {
 *     connectionStatus,
 *     isConnected,
 *     lastEvent,
 *     eventCount
 *   } = useVoteRealtime({
 *     voteId,
 *     onVoteUpdate: (event) => {
 *       console.log('투표 업데이트:', event);
 *     },
 *     onConnectionStatusChange: (status) => {
 *       console.log('연결 상태:', status);
 *     }
 *   });
 * 
 *   return (
 *     <div>
 *       <p>연결 상태: {connectionStatus}</p>
 *       <p>이벤트 수신: {eventCount}회</p>
 *       {lastEvent && (
 *         <p>마지막 이벤트: {lastEvent.type}</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useVoteRealtime(options: UseVoteRealtimeOptions = {}): UseVoteRealtimeReturn {
  const {
    voteId,
    artistVoteId,
    autoConnect = true,
    autoCleanup = true,
    onConnectionStatusChange,
    onVoteUpdate
  } = options;

  // 상태 관리
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [activeSubscriptionsCount, setActiveSubscriptionsCount] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>([]);
  const [lastEvent, setLastEvent] = useState<VoteRealtimeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  // 서비스 및 리스너 참조
  const serviceRef = useRef(getVoteRealtimeService());
  const eventListenerRef = useRef<VoteEventListener | null>(null);
  const statusListenerRef = useRef<ConnectionStatusListener | null>(null);

  // 연결 상태 업데이트
  const updateConnectionInfo = useCallback(() => {
    const service = serviceRef.current;
    setConnectionStatus(service.getConnectionStatus());
    setActiveSubscriptionsCount(service.getActiveSubscriptionsCount());
    setActiveSubscriptions(service.getActiveSubscriptions());
  }, []);

  // 이벤트 리스너 생성
  const createEventListener = useCallback((): VoteEventListener => {
    return (event: VoteRealtimeEvent) => {
      setLastEvent(event);
      setEventCount(prev => prev + 1);
      
      // 외부 콜백 호출
      if (onVoteUpdate) {
        try {
          onVoteUpdate(event);
        } catch (error) {
          console.error('[useVoteRealtime] 이벤트 콜백 오류:', error);
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtime] 이벤트 수신:', event);
      }
    };
  }, [onVoteUpdate]);

  // 연결 상태 리스너 생성
  const createStatusListener = useCallback((): ConnectionStatusListener => {
    return (status: ConnectionStatus) => {
      setConnectionStatus(status);
      
      // 외부 콜백 호출
      if (onConnectionStatusChange) {
        try {
          onConnectionStatusChange(status);
        } catch (error) {
          console.error('[useVoteRealtime] 상태 콜백 오류:', error);
        }
      }
      
      // 구독 정보 업데이트
      updateConnectionInfo();
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useVoteRealtime] 연결 상태 변경:', status);
      }
    };
  }, [onConnectionStatusChange, updateConnectionInfo]);

  // 연결 시작
  const connect = useCallback(() => {
    const service = serviceRef.current;
    
    // 기존 리스너 정리
    if (eventListenerRef.current) {
      service.removeEventListener(eventListenerRef.current);
    }
    if (statusListenerRef.current) {
      service.removeStatusListener(statusListenerRef.current);
    }
    
    // 새 리스너 등록
    eventListenerRef.current = createEventListener();
    statusListenerRef.current = createStatusListener();
    
    service.addEventListener(eventListenerRef.current);
    service.addStatusListener(statusListenerRef.current);
    
    // 구독 시작
    if (voteId !== undefined) {
      service.subscribeToVote(voteId);
    }
    if (artistVoteId !== undefined) {
      service.subscribeToArtistVote(artistVoteId);
    }
    
    // 초기 상태 업데이트
    updateConnectionInfo();
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVoteRealtime] 연결 시작:', { voteId, artistVoteId });
    }
  }, [voteId, artistVoteId, createEventListener, createStatusListener, updateConnectionInfo]);

  // 연결 해제
  const disconnect = useCallback(() => {
    const service = serviceRef.current;
    
    // 구독 해제
    if (voteId !== undefined) {
      service.unsubscribeFromVote(voteId);
    }
    if (artistVoteId !== undefined) {
      service.unsubscribeFromArtistVote(artistVoteId);
    }
    
    // 리스너 제거
    if (eventListenerRef.current) {
      service.removeEventListener(eventListenerRef.current);
      eventListenerRef.current = null;
    }
    if (statusListenerRef.current) {
      service.removeStatusListener(statusListenerRef.current);
      statusListenerRef.current = null;
    }
    
    // 상태 업데이트
    updateConnectionInfo();
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVoteRealtime] 연결 해제:', { voteId, artistVoteId });
    }
  }, [voteId, artistVoteId, updateConnectionInfo]);

  // 전체 정리
  const cleanup = useCallback(() => {
    const service = serviceRef.current;
    
    // 리스너 제거
    if (eventListenerRef.current) {
      service.removeEventListener(eventListenerRef.current);
      eventListenerRef.current = null;
    }
    if (statusListenerRef.current) {
      service.removeStatusListener(statusListenerRef.current);
      statusListenerRef.current = null;
    }
    
    // 전체 정리
    cleanupVoteRealtime();
    
    // 상태 초기화
    setConnectionStatus('disconnected');
    setActiveSubscriptionsCount(0);
    setActiveSubscriptions([]);
    setLastEvent(null);
    setEventCount(0);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[useVoteRealtime] 전체 정리 완료');
    }
  }, []);

  // 자동 연결 효과
  useEffect(() => {
    if (autoConnect && (voteId !== undefined || artistVoteId !== undefined)) {
      connect();
    }
    
    return () => {
      if (autoCleanup) {
        disconnect();
      }
    };
  }, [voteId, artistVoteId, autoConnect, autoCleanup, connect, disconnect]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (autoCleanup) {
        cleanup();
      }
    };
  }, [autoCleanup, cleanup]);

  // 계산된 값들
  const isConnected = connectionStatus === 'connected';

  return {
    connectionStatus,
    isConnected,
    connect,
    disconnect,
    cleanup,
    activeSubscriptionsCount,
    activeSubscriptions,
    lastEvent,
    eventCount
  };
}

/**
 * 투표 실시간 연결 상태만 추적하는 간단한 훅
 * 
 * @param voteId 투표 ID
 * @returns 연결 상태 정보
 */
export function useVoteConnectionStatus(voteId?: number) {
  const { connectionStatus, isConnected, activeSubscriptionsCount } = useVoteRealtime({
    voteId,
    autoConnect: !!voteId,
    autoCleanup: true
  });

  return {
    connectionStatus,
    isConnected,
    activeSubscriptionsCount
  };
}

/**
 * 투표 이벤트만 수신하는 훅
 * 
 * @param voteId 투표 ID
 * @param onEvent 이벤트 콜백
 * @returns 이벤트 정보
 */
export function useVoteEvents(
  voteId: number | undefined,
  onEvent?: (event: VoteRealtimeEvent) => void
) {
  const { lastEvent, eventCount, isConnected } = useVoteRealtime({
    voteId,
    autoConnect: !!voteId,
    autoCleanup: true,
    onVoteUpdate: onEvent
  });

  return {
    lastEvent,
    eventCount,
    isConnected
  };
} 