'use client';

import { createBrowserSupabaseClient } from './client';
import { Database } from '@/types/supabase';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// 투표 관련 테이블 타입 정의
type VoteTable = Database['public']['Tables']['vote']['Row'];
type VoteItemTable = Database['public']['Tables']['vote_item']['Row'];
type VotePickTable = Database['public']['Tables']['vote_pick']['Row'];
type ArtistVoteTable = Database['public']['Tables']['artist_vote']['Row'];
type ArtistVoteItemTable = Database['public']['Tables']['artist_vote_item']['Row'];

// Realtime 이벤트 타입 정의
export type VoteRealtimeEvent = 
  | { type: 'vote_updated'; payload: VoteTable }
  | { type: 'vote_item_updated'; payload: VoteItemTable }
  | { type: 'vote_pick_created'; payload: VotePickTable }
  | { type: 'artist_vote_updated'; payload: ArtistVoteTable }
  | { type: 'artist_vote_item_updated'; payload: ArtistVoteItemTable };

// 연결 상태 타입
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// 이벤트 리스너 타입
export type VoteEventListener = (event: VoteRealtimeEvent) => void;
export type ConnectionStatusListener = (status: ConnectionStatus) => void;

/**
 * 투표 시스템을 위한 Realtime 서비스 클래스
 */
export class VoteRealtimeService {
  private supabase = createBrowserSupabaseClient();
  private channels: Map<string, RealtimeChannel> = new Map();
  private eventListeners: Set<VoteEventListener> = new Set();
  private statusListeners: Set<ConnectionStatusListener> = new Set();
  private connectionStatus: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1초부터 시작

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
   * 현재 연결 상태 반환
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 연결 상태 업데이트 및 리스너 알림
   */
  private updateConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      this.statusListeners.forEach(listener => listener(status));
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VoteRealtime] 연결 상태 변경: ${status}`);
      }
    }
  }

  /**
   * 이벤트를 모든 리스너에게 전파
   */
  private emitEvent(event: VoteRealtimeEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[VoteRealtime] 이벤트 리스너 오류:', error);
      }
    });
  }

  /**
   * 특정 투표에 대한 실시간 구독 시작
   */
  subscribeToVote(voteId: number): void {
    const channelName = `vote_${voteId}`;
    
    if (this.channels.has(channelName)) {
      console.warn(`[VoteRealtime] 이미 구독 중인 투표: ${voteId}`);
      return;
    }

    this.updateConnectionStatus('connecting');

    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vote',
          filter: `id=eq.${voteId}`
        },
        (payload: RealtimePostgresChangesPayload<VoteTable>) => {
          if (payload.new && typeof payload.new === 'object') {
            this.emitEvent({
              type: 'vote_updated',
              payload: payload.new as VoteTable
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vote_item',
          filter: `vote_id=eq.${voteId}`
        },
        (payload: RealtimePostgresChangesPayload<VoteItemTable>) => {
          if (payload.new && typeof payload.new === 'object') {
            this.emitEvent({
              type: 'vote_item_updated',
              payload: payload.new as VoteItemTable
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vote_pick',
          filter: `vote_id=eq.${voteId}`
        },
        (payload: RealtimePostgresChangesPayload<VotePickTable>) => {
          if (payload.new && typeof payload.new === 'object') {
            this.emitEvent({
              type: 'vote_pick_created',
              payload: payload.new as VotePickTable
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.updateConnectionStatus('connected');
          this.reconnectAttempts = 0; // 성공적으로 연결되면 재연결 시도 횟수 리셋
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[VoteRealtime] 투표 ${voteId} 구독 성공`);
          }
        } else if (status === 'CHANNEL_ERROR') {
          this.updateConnectionStatus('error');
          this.handleReconnection(channelName, voteId);
        } else if (status === 'TIMED_OUT') {
          this.updateConnectionStatus('error');
          this.handleReconnection(channelName, voteId);
        } else if (status === 'CLOSED') {
          this.updateConnectionStatus('disconnected');
        }
      });

    this.channels.set(channelName, channel);
  }

  /**
   * 아티스트 투표에 대한 실시간 구독 시작
   */
  subscribeToArtistVote(artistVoteId: number): void {
    const channelName = `artist_vote_${artistVoteId}`;
    
    if (this.channels.has(channelName)) {
      console.warn(`[VoteRealtime] 이미 구독 중인 아티스트 투표: ${artistVoteId}`);
      return;
    }

    this.updateConnectionStatus('connecting');

    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'artist_vote',
          filter: `id=eq.${artistVoteId}`
        },
        (payload: RealtimePostgresChangesPayload<ArtistVoteTable>) => {
          if (payload.new && typeof payload.new === 'object') {
            this.emitEvent({
              type: 'artist_vote_updated',
              payload: payload.new as ArtistVoteTable
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'artist_vote_item',
          filter: `artist_vote_id=eq.${artistVoteId}`
        },
        (payload: RealtimePostgresChangesPayload<ArtistVoteItemTable>) => {
          if (payload.new && typeof payload.new === 'object') {
            this.emitEvent({
              type: 'artist_vote_item_updated',
              payload: payload.new as ArtistVoteItemTable
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.updateConnectionStatus('connected');
          this.reconnectAttempts = 0;
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[VoteRealtime] 아티스트 투표 ${artistVoteId} 구독 성공`);
          }
        } else if (status === 'CHANNEL_ERROR') {
          this.updateConnectionStatus('error');
          this.handleReconnection(channelName, artistVoteId, 'artist');
        } else if (status === 'TIMED_OUT') {
          this.updateConnectionStatus('error');
          this.handleReconnection(channelName, artistVoteId, 'artist');
        } else if (status === 'CLOSED') {
          this.updateConnectionStatus('disconnected');
        }
      });

    this.channels.set(channelName, channel);
  }

  /**
   * 재연결 처리
   */
  private handleReconnection(
    channelName: string, 
    voteId: number, 
    type: 'vote' | 'artist' = 'vote'
  ): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[VoteRealtime] 최대 재연결 시도 횟수 초과: ${channelName}`);
      this.updateConnectionStatus('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[VoteRealtime] ${delay}ms 후 재연결 시도 (${this.reconnectAttempts}/${this.maxReconnectAttempts}): ${channelName}`);
    }

    setTimeout(() => {
      // 기존 채널 정리
      this.unsubscribeFromChannel(channelName);
      
      // 재연결 시도
      if (type === 'artist') {
        this.subscribeToArtistVote(voteId);
      } else {
        this.subscribeToVote(voteId);
      }
    }, delay);
  }

  /**
   * 특정 투표 구독 해제
   */
  unsubscribeFromVote(voteId: number): void {
    const channelName = `vote_${voteId}`;
    this.unsubscribeFromChannel(channelName);
  }

  /**
   * 특정 아티스트 투표 구독 해제
   */
  unsubscribeFromArtistVote(artistVoteId: number): void {
    const channelName = `artist_vote_${artistVoteId}`;
    this.unsubscribeFromChannel(channelName);
  }

  /**
   * 채널 구독 해제
   */
  private unsubscribeFromChannel(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.channels.delete(channelName);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VoteRealtime] 채널 구독 해제: ${channelName}`);
      }
    }
  }

  /**
   * 모든 구독 해제 및 정리
   */
  unsubscribeAll(): void {
    this.channels.forEach((channel, channelName) => {
      this.supabase.removeChannel(channel);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VoteRealtime] 채널 구독 해제: ${channelName}`);
      }
    });
    
    this.channels.clear();
    this.eventListeners.clear();
    this.statusListeners.clear();
    this.updateConnectionStatus('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * 활성 구독 수 반환
   */
  getActiveSubscriptionsCount(): number {
    return this.channels.size;
  }

  /**
   * 활성 구독 목록 반환
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.channels.keys());
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
    voteRealtimeService.unsubscribeAll();
    voteRealtimeService = null;
  }
} 