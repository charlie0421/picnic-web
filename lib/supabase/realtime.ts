'use client';

import {
  RealtimePostgresChangesPayload
} from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// 투표 관련 테이블 타입 정의
type VoteTable = Database['public']['Tables']['vote']['Row'];
type VoteItemTable = Database['public']['Tables']['vote_item']['Row'];
type VotePickTable = Database['public']['Tables']['vote_pick']['Row'];
type ArtistVoteTable = Database['public']['Tables']['artist_vote']['Row'];
type ArtistVoteItemTable = Database['public']['Tables']['artist_vote_item']['Row'];

// Realtime 이벤트 타입 정의
export type VoteRealtimeEvent = 
  | { type: 'vote_updated'; payload: RealtimePostgresChangesPayload<VoteTable> }
  | { type: 'vote_item_updated'; payload: RealtimePostgresChangesPayload<VoteItemTable> }
  | { type: 'vote_pick_created'; payload: RealtimePostgresChangesPayload<VotePickTable> }
  | { type: 'artist_vote_updated'; payload: RealtimePostgresChangesPayload<ArtistVoteTable> }
  | { type: 'artist_vote_item_updated'; payload: RealtimePostgresChangesPayload<ArtistVoteItemTable> };

// 연결 상태 타입 (확장됨)
export type ConnectionStatus = 
  | 'connecting' 
  | 'connected' 
  | 'disconnected' 
  | 'error' 
  | 'network_error'
  | 'reconnecting'
  | 'suspended';

// 오류 타입 정의
export type ErrorType = 
  | 'network'
  | 'subscription'
  | 'authentication'
  | 'timeout'
  | 'rate_limit'
  | 'unknown';

// 연결 정보 타입
export interface ConnectionInfo {
  status: ConnectionStatus;
  lastConnected?: Date;
  lastError?: {
    type: ErrorType;
    message: string;
    timestamp: Date;
    attemptCount: number;
  };
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  nextReconnectAt?: Date;
  isOnline: boolean;
  isVisible: boolean;
}

// 이벤트 리스너 타입
export type VoteEventListener = (event: VoteRealtimeEvent) => void;
export type ConnectionStatusListener = (status: ConnectionStatus, info: ConnectionInfo) => void;

// 데이터 동기화 콜백 타입
export type DataSyncCallback = (voteId: number) => Promise<void>;

/**
 * 투표 시스템을 위한 SSE 기반 Realtime 서비스 클래스
 */
export class VoteRealtimeService {
  private eventSources: Map<string, EventSource> = new Map();
  private eventListeners: Set<VoteEventListener> = new Set();
  private statusListeners: Set<ConnectionStatusListener> = new Set();
  private dataSyncCallbacks: Map<number, DataSyncCallback> = new Map();
  
  // 연결 상태 관리
  private connectionStatus: ConnectionStatus = 'disconnected';
  private connectionInfo: ConnectionInfo = {
    status: 'disconnected',
    reconnectAttempts: 0,
    maxReconnectAttempts: 10, // 증가된 재시도 횟수
    isOnline: true, // 서버사이드에서는 기본값으로 설정
    isVisible: true // 서버사이드에서는 기본값으로 설정
  };
  
  // 재연결 설정
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1초
  private maxReconnectDelay = 60000; // 60초
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  // 네트워크 및 가시성 상태
  private isOnline = true; // 서버사이드에서는 기본값으로 설정
  private isVisible = true; // 서버사이드에서는 기본값으로 설정
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: Date | null = null;
  
  // 이벤트 큐 (오프라인 시 이벤트 저장)
  private pendingEvents: VoteRealtimeEvent[] = [];
  private maxPendingEvents = 100;

  constructor() {
    // 이제 브라우저 환경에서만 동작하므로, 조건문은 불필요합니다.
  }

  /**
   * 네트워크 상태 감지 설정
   */
  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));
    }
  }

  /**
   * 페이지 가시성 감지 설정
   */
  private setupVisibilityListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }
  }

  /**
   * 하트비트 시작 (연결 상태 확인)
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.lastHeartbeat = new Date();
      
      // 연결되어 있지만 일정 시간 이상 이벤트가 없으면 연결 확인
      if (this.connectionStatus === 'connected') {
        const timeSinceLastHeartbeat = Date.now() - (this.lastHeartbeat?.getTime() || 0);
        if (timeSinceLastHeartbeat > 30000) { // 30초
          this.checkConnection();
        }
      }
    }, 10000); // 10초마다 확인
  }

  /**
   * 온라인 상태 처리
   */
  private handleOnline(): void {
    this.isOnline = true;
    this.connectionInfo.isOnline = true;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[VoteRealtime] 네트워크 온라인 복구');
    }
    
    // 네트워크 복구 시 자동 재연결
    this.reconnectAllChannels();
  }

  /**
   * 오프라인 상태 처리
   */
  private handleOffline(): void {
    this.isOnline = false;
    this.connectionInfo.isOnline = false;
    this.updateConnectionStatus('network_error');
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[VoteRealtime] 네트워크 오프라인');
    }
  }

  /**
   * 페이지 가시성 변경 처리
   */
  private handleVisibilityChange(): void {
    if (typeof document !== 'undefined') {
      this.isVisible = !document.hidden;
      this.connectionInfo.isVisible = this.isVisible;
      
      if (this.isVisible) {
        // 페이지가 보이게 되면 연결 상태 확인 및 재연결
        if (process.env.NODE_ENV === 'development') {
          console.log('[VoteRealtime] 페이지 활성화 - 연결 확인');
        }
        this.checkConnection();
      } else {
        // 페이지가 숨겨지면 연결 일시 중단 (배터리 절약)
        if (process.env.NODE_ENV === 'development') {
          console.log('[VoteRealtime] 페이지 비활성화 - 연결 일시 중단');
        }
        this.updateConnectionStatus('suspended');
      }
    }
  }

  /**
   * 연결 상태 확인
   */
  private checkConnection(): void {
    // 온라인이고 페이지가 보이는 상태에서만 연결 확인
    if (!this.isOnline || !this.isVisible) {
      return;
    }

    // 연결되어 있지 않으면 재연결 시도
    if (this.connectionStatus !== 'connected') {
      this.reconnectAllChannels();
    }
  }

  /**
   * 모든 채널 재연결
   */
  private reconnectAllChannels(): void {
    if (!this.isOnline || !this.isVisible) {
      return;
    }

    const channelNames = Array.from(this.eventSources.keys());
    
    // 기존 채널들 정리
    this.eventSources.forEach((eventSource, channelName) => {
      eventSource.close();
    });
    this.eventSources.clear();

    // 재연결 시도
    channelNames.forEach(channelName => {
      const voteId = this.extractVoteIdFromChannelName(channelName);
      if (voteId) {
        if (channelName.startsWith('artist_vote_')) {
          this.subscribeToArtistVote(voteId);
        } else {
          this.subscribeToVote(voteId);
        }
      }
    });
  }

  /**
   * 채널명에서 투표 ID 추출
   */
  private extractVoteIdFromChannelName(channelName: string): number | null {
    const match = channelName.match(/(?:artist_)?vote_(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * 투표 이벤트 리스너 추가
   */
  addEventListener(listener: VoteEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * 투표 이벤트 리스너 제거
   */
  removeEventListener(listener: VoteEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * 연결 상태 리스너 추가
   */
  addStatusListener(listener: ConnectionStatusListener): void {
    this.statusListeners.add(listener);
  }

  /**
   * 연결 상태 리스너 제거
   */
  removeStatusListener(listener: ConnectionStatusListener): void {
    this.statusListeners.delete(listener);
  }

  /**
   * 데이터 동기화 콜백 추가
   */
  addDataSyncCallback(voteId: number, callback: DataSyncCallback): void {
    this.dataSyncCallbacks.set(voteId, callback);
  }

  /**
   * 데이터 동기화 콜백 제거
   */
  removeDataSyncCallback(voteId: number): void {
    this.dataSyncCallbacks.delete(voteId);
  }

  /**
   * 현재 연결 상태 반환
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 연결 정보 반환
   */
  getConnectionInfo(): ConnectionInfo {
    return { ...this.connectionInfo };
  }

  /**
   * 연결 상태 업데이트 및 리스너 알림
   */
  private updateConnectionStatus(status: ConnectionStatus, error?: { type: ErrorType; message: string }): void {
    const previousStatus = this.connectionStatus;
    this.connectionStatus = status;
    
    // 연결 정보 업데이트
    this.connectionInfo.status = status;
    this.connectionInfo.reconnectAttempts = this.reconnectAttempts;
    
    if (status === 'connected') {
      this.connectionInfo.lastConnected = new Date();
      this.connectionInfo.lastError = undefined;
    } else if (error) {
      this.connectionInfo.lastError = {
        ...error,
        timestamp: new Date(),
        attemptCount: this.reconnectAttempts
      };
    }
    
    // 상태가 변경된 경우에만 리스너 알림
    if (previousStatus !== status) {
      this.statusListeners.forEach(listener => {
        try {
          listener(status, this.connectionInfo);
        } catch (err) {
          console.error('[VoteRealtime] 상태 리스너 오류:', err);
        }
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VoteRealtime] 연결 상태 변경: ${previousStatus} → ${status}`);
      }
    }
    
    // 연결 성공 시 데이터 동기화 실행
    if (status === 'connected' && previousStatus !== 'connected') {
      this.performDataSync();
    }
  }

  /**
   * 데이터 동기화 실행
   */
  private async performDataSync(): Promise<void> {
    if (this.dataSyncCallbacks.size === 0) return;
    
    // Map을 Array로 변환하여 이터레이션
    const entries = Array.from(this.dataSyncCallbacks.entries());
    for (const [voteId, callback] of entries) {
      try {
        await callback(voteId);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[VoteRealtime] 투표 ${voteId} 데이터 동기화 완료`);
        }
      } catch (error) {
        console.error(`[VoteRealtime] 투표 ${voteId} 데이터 동기화 실패:`, error);
      }
    }
  }

  /**
   * 이벤트를 모든 리스너에게 전파
   */
  private emitEvent(event: VoteRealtimeEvent): void {
    // 오프라인 상태면 이벤트를 큐에 저장
    if (!this.isOnline || this.connectionStatus !== 'connected') {
      this.queueEvent(event);
      return;
    }
    
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[VoteRealtime] 이벤트 리스너 오류:', error);
      }
    });
  }

  /**
   * 이벤트를 큐에 저장
   */
  private queueEvent(event: VoteRealtimeEvent): void {
    if (this.pendingEvents.length >= this.maxPendingEvents) {
      // 큐가 가득 찼으면 오래된 이벤트 제거
      this.pendingEvents.shift();
    }
    
    this.pendingEvents.push(event);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[VoteRealtime] 이벤트 큐에 저장: ${event.type} (큐 크기: ${this.pendingEvents.length})`);
    }
  }

  /**
   * 큐에 저장된 이벤트들을 처리
   */
  private processPendingEvents(): void {
    if (this.pendingEvents.length === 0) return;
    
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[VoteRealtime] ${events.length}개의 대기 중인 이벤트 처리`);
    }
    
    events.forEach(event => {
      this.eventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[VoteRealtime] 대기 이벤트 리스너 오류:', error);
        }
      });
    });
  }

  /**
   * 오류 타입 감지
   */
  private detectErrorType(status: string, error?: any): ErrorType {
    if (!navigator.onLine) return 'network';
    if (status === 'TIMED_OUT') return 'timeout';
    if (status === 'CHANNEL_ERROR') {
      if (error?.message?.includes('auth')) return 'authentication';
      if (error?.message?.includes('rate')) return 'rate_limit';
      return 'subscription';
    }
    return 'unknown';
  }

  /**
   * 수동 재연결 시도
   */
  public manualReconnect(): void {
    if (!this.isOnline) {
      console.warn('[VoteRealtime] 네트워크가 오프라인 상태입니다.');
      return;
    }
    
    // 재연결 시도 횟수 리셋
    this.reconnectAttempts = 0;
    this.reconnectAllChannels();
  }

  /**
   * 재연결 처리 (개선됨)
   */
  private handleReconnection(
    channelName: string, 
    voteId: number, 
    type: 'vote' | 'artist' = 'vote',
    errorType?: ErrorType
  ): void {
    // 오프라인이거나 페이지가 숨겨진 상태면 재연결하지 않음
    if (!this.isOnline || !this.isVisible) {
      console.log(`[VoteRealtime] 재연결 조건 불충족: online=${this.isOnline}, visible=${this.isVisible}`);
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[VoteRealtime] 최대 재연결 시도 횟수 초과: ${channelName}`);
      this.updateConnectionStatus('error', {
        type: errorType || 'unknown',
        message: '최대 재연결 시도 횟수를 초과했습니다.'
      });
      return;
    }

    // 기존 타이머가 있으면 제거
    const existingTimeout = this.reconnectTimeouts.get(channelName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    this.reconnectAttempts++;
    this.updateConnectionStatus('reconnecting');
    
    // 지수 백오프 계산 (지터 추가)
    const baseDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 1000; // 최대 1초 지터
    const delay = Math.min(baseDelay + jitter, this.maxReconnectDelay);
    
    this.connectionInfo.nextReconnectAt = new Date(Date.now() + delay);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[VoteRealtime] ${Math.round(delay)}ms 후 재연결 시도 (${this.reconnectAttempts}/${this.maxReconnectAttempts}): ${channelName}`);
    }

    const timeout = setTimeout(() => {
      const voteId = this.extractVoteIdFromChannelName(channelName);
      if (voteId !== null) {
        if (channelName.startsWith('artist-vote')) {
          this.unsubscribe('artist-vote', voteId);
        } else {
          this.unsubscribe('vote', voteId);
        }
      }
      this.reconnectTimeouts.delete(channelName);
      
      // 재연결 시도
      if (voteId !== null) {
        if (type === 'artist') {
          this.subscribeToArtistVote(voteId);
        } else {
          this.subscribeToVote(voteId);
        }
      }
    }, delay);

    this.reconnectTimeouts.set(channelName, timeout);
  }

  private createChannelKey(type: 'vote' | 'artist-vote', voteId: number): string {
    return `${type}-${voteId}`;
  }

  private subscribe(type: 'vote' | 'artist-vote', voteId: number) {
    const channelKey = this.createChannelKey(type, voteId);
    if (this.eventSources.has(channelKey)) {
      console.warn(`[SSE] Already subscribed to ${channelKey}`);
      return;
    }

    const url = `/api/realtime/${type}/${voteId}`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log(`[SSE] Connection opened for ${channelKey}`);
      // 상태 업데이트 로직 추가
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        // Supabase의 payload 구조와 유사하게 이벤트를 재구성하여 전달
        const realtimeEvent: VoteRealtimeEvent = {
          type: `${parsedData.type}_${parsedData.eventType.toLowerCase()}`, // e.g., vote_updated
          payload: parsedData,
        } as any; // 타입 캐스팅 필요
        
        this.emitEvent(realtimeEvent);
      } catch (e) {
        console.error('[SSE] Failed to parse message:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error(`[SSE] Error for ${channelKey}:`, err);
      // 에러 상태 업데이트 로직 추가
      eventSource.close();
      this.eventSources.delete(channelKey);
    };

    this.eventSources.set(channelKey, eventSource);
  }

  public subscribeToVote(voteId: number) {
    this.subscribe('vote', voteId);
  }

  public subscribeToArtistVote(artistVoteId: number) {
    this.subscribe('artist-vote', artistVoteId);
  }

  private unsubscribe(type: 'vote' | 'artist-vote', voteId: number) {
    const channelKey = this.createChannelKey(type, voteId);
    const eventSource = this.eventSources.get(channelKey);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(channelKey);
      console.log(`[SSE] Unsubscribed from ${channelKey}`);
    }
  }

  public unsubscribeFromVote(voteId: number) {
    this.unsubscribe('vote', voteId);
  }

  public unsubscribeFromArtistVote(artistVoteId: number) {
    this.unsubscribe('artist-vote', artistVoteId);
  }

  /**
   * 모든 활성 구독을 해제하고 서비스를 정리합니다.
   */
  public disconnectAll(): void {
    console.log('[SSE] Disconnecting all event sources...');
    this.eventSources.forEach((eventSource) => {
      eventSource.close();
    });
    this.eventSources.clear();
    this.eventListeners.clear();
    this.statusListeners.clear();
    this.reconnectTimeouts.forEach(clearTimeout);
    this.reconnectTimeouts.clear();
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.updateConnectionStatus('disconnected');
    console.log('[SSE] All connections closed and service cleaned up.');
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  // 활성 구독 수 반환
  getActiveSubscriptionsCount(): number {
    return this.eventSources.size;
  }

  // 활성 구독 목록 반환
  getActiveSubscriptions(): string[] {
    return Array.from(this.eventSources.keys());
  }

  // 대기 중인 이벤트 수 반환
  getPendingEventsCount(): number {
    return this.pendingEvents.length;
  }

  // 연결 통계 반환
  getConnectionStats() {
    return {
      status: this.connectionStatus,
      isOnline: this.isOnline,
      isVisible: this.isVisible,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      activeSubscriptions: this.getActiveSubscriptionsCount(),
      pendingEvents: this.getPendingEventsCount(),
      lastHeartbeat: this.lastHeartbeat,
      connectionInfo: this.getConnectionInfo()
    };
  }
}

// 싱글톤 인스턴스
let voteRealtimeService: VoteRealtimeService | null = null;

/**
 * 투표 Realtime 서비스 싱글톤 인스턴스 반환
 */
export function getVoteRealtimeService(): VoteRealtimeService {
  if (!voteRealtimeService) {
    voteRealtimeService = new VoteRealtimeService();
  }
  return voteRealtimeService;
}

/**
 * 컴포넌트 언마운트 시 정리 함수
 */
export function cleanupVoteRealtime(): void {
  if (voteRealtimeService) {
    voteRealtimeService.disconnectAll();
    voteRealtimeService = null;
  }
} 