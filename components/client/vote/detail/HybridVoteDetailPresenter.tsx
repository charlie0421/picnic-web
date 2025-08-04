'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import {
  getVoteStatus,
  formatRemainingTime,
  formatTimeUntilStart,
} from '@/components/server/utils';
import { VoteCard, VoteRankCard } from '..';
import { VoteTimer } from '../common/VoteTimer';
import { VoteSearch } from './VoteSearch';
import { VoteButton } from '../common/VoteButton';
import { Badge, Card } from '@/components/common';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// 디바운싱 훅 추가
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// 알림 시스템을 위한 타입 정의
interface NotificationState {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: Date;
}

// 하이브리드 시스템을 위한 타입 정의
type DataSourceMode = 'realtime' | 'polling' | 'static';

interface ConnectionState {
  mode: DataSourceMode;
  isConnected: boolean;
  lastUpdate: Date | null;
  errorCount: number;
  retryCount: number;
}

interface ConnectionQuality {
  score: number; // 0-100 점수
  latency: number; // ms
  errorRate: number; // 0-1
  consecutiveErrors: number;
  consecutiveSuccesses: number;
  lastConnectionTime: Date | null;
  averageResponseTime: number;
}

interface ThresholdConfig {
  maxErrorCount: number;
  maxConsecutiveErrors: number;
  minConnectionQuality: number;
  realtimeRetryDelay: number;
  pollingInterval: number;
  qualityCheckInterval: number;
}

export interface HybridVoteDetailPresenterProps {
  vote: Vote;
  initialItems: VoteItem[];
  rewards?: any[];
  className?: string;
  enableRealtime?: boolean; // 리얼타임 기능 활성화 여부
  pollingInterval?: number; // 폴링 간격 (ms)
  maxRetries?: number; // 최대 재시도 횟수
}

export function HybridVoteDetailPresenter({
  vote,
  initialItems,
  rewards = [],
  className,
  enableRealtime = true,
  pollingInterval = 1000,
  maxRetries = 3,
}: HybridVoteDetailPresenterProps) {
  const { currentLanguage } = useLanguageStore();
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });

  // 기존 상태들 - 초기 데이터를 올바른 형태로 변환
  const [voteItems, setVoteItems] = React.useState<VoteItem[]>(() => {
    // initialItems가 올바른 형태인지 확인하고 필요시 변환
    return initialItems.map(item => ({
      ...item,
      // 호환성을 위한 추가 필드들 (GridView, VoteRankCard에서 사용)
      name: item.artist?.name || 'Unknown',
      image_url: item.artist?.image || '',
      total_votes: item.vote_total || 0,
    }));
  });
  const [selectedItem, setSelectedItem] = React.useState<VoteItem | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isVoting, setIsVoting] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [showVoteModal, setShowVoteModal] = React.useState(false);
  const [voteCandidate, setVoteCandidate] = React.useState<VoteItem | null>(null);
  const [voteAmount, setVoteAmount] = React.useState(1);
  const [availableVotes, setAvailableVotes] = React.useState(10);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const headerRef = React.useRef<HTMLDivElement>(null);

  // 사용자 관련 상태
  const [user, setUser] = React.useState<any>(null);
  const [userVote, setUserVote] = React.useState<any>(null);

  // 알림 시스템 상태
  const [notifications, setNotifications] = React.useState<NotificationState[]>([]);

  // 하이브리드 시스템 상태
  const [connectionState, setConnectionState] = React.useState<ConnectionState>({
    mode: enableRealtime ? 'realtime' : 'static',
    isConnected: false,
    lastUpdate: null,
    errorCount: 0,
    retryCount: 0,
  });

  // 폴링 모드 시작 시간 추적 (최소 폴링 시간 보장용)
  const [pollingStartTime, setPollingStartTime] = React.useState<Date | null>(null);

  // 연결 품질 모니터링 상태
  const [connectionQuality, setConnectionQuality] = React.useState<ConnectionQuality>({
    score: 100,
    latency: 0,
    errorRate: 0,
    consecutiveErrors: 0,
    consecutiveSuccesses: 0,
    lastConnectionTime: null,
    averageResponseTime: 0,
  });

  // 임계값 설정 - 더 보수적으로 조정
  const thresholds: ThresholdConfig = {
    maxErrorCount: 3,
    maxConsecutiveErrors: 2,
    minConnectionQuality: 70,
    realtimeRetryDelay: 30000, // 30초로 증가 (너무 빈번한 전환 방지)
    pollingInterval: 1000, // 1초
    qualityCheckInterval: 15000, // 15초로 증가 (더 안정적인 모니터링)
  };

  // 폴링 관련 ref
  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const realtimeSubscriptionRef = React.useRef<any>(null);
  const qualityCheckIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const realtimeRetryTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 성능 측정을 위한 ref
  const requestStartTimeRef = React.useRef<number>(0);

  // 폴링 관련 상태
  const [lastPollingUpdate, setLastPollingUpdate] = React.useState<Date | null>(null);
  const [pollingErrorCount, setPollingErrorCount] = React.useState(0);

  // 리얼타임 하이라이트 상태
  const [recentlyUpdatedItems, setRecentlyUpdatedItems] = React.useState<Set<string | number>>(new Set());
  
  // 하이라이트 타이머 관리
  const highlightTimersRef = React.useRef<Map<string | number, NodeJS.Timeout>>(new Map());

  // 하이라이트 관리 함수
  const setItemHighlight = React.useCallback((itemId: string | number, highlight: boolean = true, duration: number = 3000) => {
    // 기존 타이머가 있으면 취소
    const existingTimer = highlightTimersRef.current.get(itemId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      highlightTimersRef.current.delete(itemId);
      console.log(`⏰ [Highlight] 기존 타이머 취소: ${itemId}`);
    }

    if (highlight) {
      // 하이라이트 추가
      console.log(`✨ [Highlight] 하이라이트 시작: ${itemId} (${duration}ms)`);
      setRecentlyUpdatedItems(prev => new Set(Array.from(prev).concat(itemId)));
      
      // 새 타이머 설정
      const timer = setTimeout(() => {
        console.log(`🕐 [Highlight] 하이라이트 종료: ${itemId}`);
        setRecentlyUpdatedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
        highlightTimersRef.current.delete(itemId);
      }, duration);
      
      highlightTimersRef.current.set(itemId, timer);
    } else {
      // 즉시 하이라이트 제거
      console.log(`🚫 [Highlight] 즉시 제거: ${itemId}`);
      setRecentlyUpdatedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  }, []);

  // 컴포넌트 언마운트 시 타이머 정리
  React.useEffect(() => {
    return () => {
      // 모든 하이라이트 타이머 정리
      highlightTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      highlightTimersRef.current.clear();
      console.log('🧹 [Highlight] 모든 타이머 정리 완료');
    };
  }, []);

  // Supabase 클라이언트
  const supabase = createBrowserSupabaseClient();

  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';

  // 디바운싱된 검색어
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // 알림 시스템 함수들
  const addNotification = React.useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
    const newNotification: NotificationState = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    
    setNotifications(prev => [...prev, newNotification]);
    
    // 자동 제거 (기본 5초)
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(newNotification.id);
    }, duration);
  }, []);

  const removeNotification = React.useCallback((id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  // 연결 상태 변경 알림
  const notifyConnectionStateChange = React.useCallback((from: DataSourceMode, to: DataSourceMode) => {
    const modeNames = {
      realtime: '실시간',
      polling: '폴링',
      static: '정적'
    };

    addNotification({
      type: 'info',
      title: '연결 모드 변경',
      message: `${modeNames[from]}에서 ${modeNames[to]} 모드로 전환되었습니다.`,
      duration: 3000,
    });
  }, [addNotification]);

  // 사용자 정보 가져오기
  React.useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase]);

  // 연결 품질 업데이트
  const updateConnectionQuality = React.useCallback((success: boolean, responseTime?: number) => {
    setConnectionQuality(prev => {
      const newConsecutiveErrors = success ? 0 : prev.consecutiveErrors + 1;
      const newConsecutiveSuccesses = success ? prev.consecutiveSuccesses + 1 : 0;
      const newErrorRate = success ? Math.max(0, prev.errorRate - 0.1) : Math.min(1, prev.errorRate + 0.2);
      
      // 연결 품질 점수 계산 (0-100)
      let newScore = 100;
      newScore -= newErrorRate * 50; // 에러율 기반 감점
      newScore -= newConsecutiveErrors * 15; // 연속 에러 감점
      newScore = Math.max(0, Math.min(100, newScore));
      
      const newLatency = responseTime ? responseTime : prev.latency;
      const newAverageResponseTime = responseTime 
        ? (prev.averageResponseTime * 0.8 + responseTime * 0.2)
        : prev.averageResponseTime;

      return {
        ...prev,
        score: newScore,
        latency: newLatency,
        errorRate: newErrorRate,
        consecutiveErrors: newConsecutiveErrors,
        consecutiveSuccesses: newConsecutiveSuccesses,
        lastConnectionTime: success ? new Date() : prev.lastConnectionTime,
        averageResponseTime: newAverageResponseTime,
      };
    });
  }, []);

  // 데이터 업데이트 함수 (폴링용)
  const updateVoteDataPolling = React.useCallback(async () => {
    if (!vote?.id) return;
    
    // 리얼타임 모드에서는 폴링 함수 실행 중단 (보호 로직)
    if (connectionState.mode === 'realtime') {
      console.log('[Polling] 리얼타임 모드에서 폴링 함수 호출 차단');
      return;
    }

    const startTime = performance.now();
    requestStartTimeRef.current = startTime;

    try {
      // 폴링 로그를 5초마다만 출력 (1초마다 반복 방지) + 리얼타임 모드에서는 로그 출력 안함
      const shouldLog = connectionState.mode === 'polling' && 
        (!lastPollingUpdate || (Date.now() - lastPollingUpdate.getTime()) > 5000);
      
      if (shouldLog) {
        console.log('[Polling] Fetching vote data...');
      }
      
      // Fetch vote data with vote_items
      const { data: voteData, error: voteError } = await supabase
        .from('vote')
        .select(`
          id,
          title,
          vote_content,
          area,
          start_at,
          stop_at,
          created_at,
          updated_at,
          vote_item (
            id,
            artist_id,
            group_id,
            vote_id,
            vote_total,
            created_at,
            updated_at,
            deleted_at,
            artist:artist_id (
              id,
              name,
              image,
              birth_date,
              gender,
              group_id,
              artistGroup:group_id (
                id,
                name,
                image
              )
            )
          )
        `)
        .eq('id', vote.id)
        .single();

      const responseTime = performance.now() - startTime;

      if (voteError) {
        console.error('[Polling] Vote fetch error:', voteError);
        setPollingErrorCount(prev => prev + 1);
        updateConnectionQuality(false, responseTime);
        
        // 사용자에게 에러 알림
        addNotification({
          type: 'error',
          title: '데이터 로딩 오류',
          message: '투표 데이터를 가져오는 중 오류가 발생했습니다.',
          duration: 4000,
        });
        return;
      }

      if (voteData) {
        if (shouldLog) {
          console.log('[Polling] Vote data received:', voteData);
        }
        
        // Transform the data to match our VoteItem interface (올바른 데이터 구조)
        const transformedVoteItems = (voteData.vote_item || []).map((item: any) => ({
          id: item.id,
          artist_id: item.artist_id,
          group_id: item.group_id,
          vote_id: item.vote_id,
          vote_total: item.vote_total || 0,
          created_at: item.created_at,
          updated_at: item.updated_at,
          deleted_at: item.deleted_at,
          // 아티스트 정보를 올바르게 매핑 (VoteRankCard가 기대하는 구조)
          artist: item.artist ? {
            id: item.artist.id,
            name: item.artist.name,
            image: item.artist.image,
            ...item.artist
          } : null,
          // 호환성을 위한 추가 필드들
          name: item.artist?.name || 'Unknown',
          image_url: item.artist?.image || '',
          total_votes: item.vote_total || 0,
          rank: 0 // Will be calculated after sorting
        }));

        // Sort by vote total and assign ranks
        const sortedItems = transformedVoteItems
          .sort((a: any, b: any) => (b.total_votes || 0) - (a.total_votes || 0))
          .map((item: any, index: number) => ({
            ...item,
            rank: index + 1
          }));

        setVoteItems(sortedItems);
        setLastPollingUpdate(new Date());
        setPollingErrorCount(0); // Reset error count on success
        updateConnectionQuality(true, responseTime);
        
        // 연결 상태 업데이트
        setConnectionState(prev => ({
          ...prev,
          lastUpdate: new Date(),
          errorCount: 0,
        }));
      }

      // Fetch user vote if user is available
      if (user) {
        const { data: userVoteData, error: userVoteError } = await supabase
          .from('vote_pick')
          .select('vote_item_id, amount, created_at')
          .eq('vote_id', vote.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }); // 최신 투표부터 정렬

        if (userVoteError) {
          console.error('[Polling] User vote fetch error:', userVoteError);
          updateConnectionQuality(false);
                  } else if (userVoteData && userVoteData.length > 0) {
          // 여러 투표 기록이 있는 경우 처리
          if (userVoteData.length > 1 && shouldLog) {
            console.log(`[Polling] 사용자가 ${userVoteData.length}번 투표함:`, userVoteData);
            
            // 투표 기록 요약 계산
            const voteSummary = {
              totalVotes: userVoteData.reduce((sum, vote) => sum + (vote.amount || 0), 0),
              voteCount: userVoteData.length,
              lastVoteItem: userVoteData[0].vote_item_id, // 가장 최근 투표한 아이템
                             allVoteItems: Array.from(new Set(userVoteData.map(v => v.vote_item_id))), // 투표한 모든 아이템 (중복 제거)
              votes: userVoteData
            };
            
            setUserVote(voteSummary);
          } else {
            // 단일 투표 기록
            setUserVote({
              totalVotes: userVoteData[0].amount || 0,
              voteCount: 1,
              lastVoteItem: userVoteData[0].vote_item_id,
              allVoteItems: [userVoteData[0].vote_item_id],
              votes: userVoteData
            });
          }
        } else {
          // 투표 기록 없음
          setUserVote(null);
        }
      }

    } catch (error) {
      const responseTime = performance.now() - startTime;
      console.error('[Polling] Unexpected error:', error);
      setPollingErrorCount(prev => prev + 1);
      updateConnectionQuality(false, responseTime);
      
      // 연결 상태에 에러 추가
      setConnectionState(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1,
      }));
    }
  }, [vote?.id, user, supabase, updateConnectionQuality]);

  // 데이터 업데이트 함수 (리얼타임용)
  const updateVoteData = React.useCallback(async () => {
    if (!vote?.id) return;
    
    try {
      console.log(`[${connectionState.mode}] 리얼타임 데이터 업데이트 시작...`);
      
      // 실제 API 호출로 최신 투표 데이터 가져오기
      const { data: items, error } = await supabase
        .from('vote_item')
        .select(`
          id,
          artist_id,
          vote_total,
          artist:artist_id (
            id,
            name,
            image,
            group:group_id (
              id,
              name
            )
          )
        `)
        .eq('vote_id', vote.id)
        .order('vote_total', { ascending: false });

      if (error) {
        console.error(`[${connectionState.mode}] 데이터 업데이트 에러:`, error);
        throw error;
      }

      if (items) {
        // VoteItem 인터페이스에 맞게 데이터 변환
        const transformedVoteItems = items.map(item => ({
          id: item.id,
          artist_id: item.artist_id,
          vote_total: item.vote_total,
          artist: item.artist || undefined, // null을 undefined로 변환하여 Artist | undefined 타입에 맞춤
          // VoteItem 인터페이스 필수 필드들
          created_at: new Date().toISOString(),
          deleted_at: null,
          group_id: item.artist?.group?.id || 0,
          updated_at: new Date().toISOString(),
          vote_id: vote.id,
          // 호환성을 위한 추가 필드들 (기존 컴포넌트에서 사용)
          name: item.artist?.name,
          image_url: item.artist?.image,
          total_votes: item.vote_total,
        }));

        setVoteItems(transformedVoteItems as VoteItem[]);
        console.log(`[${connectionState.mode}] 투표 데이터 업데이트 완료: ${items.length}개 아이템`);
      }

      // 사용자 투표 상태도 함께 업데이트
      if (user) {
        const { data: userVoteData } = await supabase
          .from('vote_pick')
          .select('vote_item_id, amount, created_at')
          .eq('vote_id', vote.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (userVoteData && userVoteData.length > 0) {
          setUserVote(userVoteData);
          console.log(`[${connectionState.mode}] 사용자 투표 상태 업데이트: ${userVoteData.length}개 투표`);
        }
      }
      
      setConnectionState(prev => ({
        ...prev,
        lastUpdate: new Date(),
        errorCount: 0,
      }));
      
    } catch (error) {
      console.error(`[${connectionState.mode}] 데이터 업데이트 실패:`, error);
      setConnectionState(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1,
      }));
    }
  }, [vote.id, connectionState.mode, supabase]);

  // 폴링 시작
  const startPollingMode = React.useCallback(() => {
    // 이미 폴링 중이라면 중복 시작 방지
    if (pollingIntervalRef.current) {
      console.log('[Polling] 이미 폴링 중이므로 기존 인터벌 정리');
      clearInterval(pollingIntervalRef.current);
    }

    console.log('🔄 [Polling] Starting polling mode (1s interval)', {
      voteId: vote.id,
      enableRealtime: enableRealtime,
      timestamp: new Date().toLocaleTimeString()
    });
    setConnectionState(prev => ({
      ...prev,
      mode: 'polling' as DataSourceMode,
      isConnected: true,
    }));
    
    // 즉시 한 번 업데이트
    updateVoteDataPolling();
    
    // 1초마다 폴링
    const interval = setInterval(() => {
      updateVoteDataPolling();
    }, 1000);
    
    pollingIntervalRef.current = interval;
  }, [updateVoteDataPolling]);

  // 리얼타임 연결 시도
  const connectRealtime = React.useCallback(async () => {
    if (!enableRealtime) {
      console.log('[Realtime] ❌ enableRealtime이 false로 설정됨');
      return;
    }
    if (!vote?.id) {
      console.log('[Realtime] ❌ vote.id가 없음:', vote);
      return;
    }

    try {
      console.log('[Realtime] 🔄 연결 시도 중...', {
        voteId: vote.id,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '❌ 없음',
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '설정됨' : '❌ 없음'
      });
      
      // 실제 Supabase 리얼타임 연결
      const subscription = supabase
        .channel('supabase_realtime')
        .on(
          'postgres_changes',
          {
            event: '*', // 모든 이벤트 수신 (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'vote_item',
            filter: `vote_id=eq.${vote.id}`,
          },
          (payload) => {
            console.log('🔥 [Realtime] vote_item 변화 수신!', {
              event: payload.eventType,
              table: payload.table,
              new: payload.new,
              old: payload.old,
              timestamp: new Date().toLocaleTimeString(),
              payload: payload // 전체 payload 확인
            });
            
            // 업데이트된 아이템을 하이라이트 표시
            if (payload.eventType === 'UPDATE' && payload.new?.id) {
              console.log(`🎯 [Realtime] 아이템 ${payload.new.id} 하이라이트 표시`);
              setItemHighlight(payload.new.id, true, 3000);
            }
            
            // 리얼타임 모드에서는 폴링 함수가 아닌 별도 업데이트 사용
            if (connectionState.mode === 'realtime') {
              console.log('🔄 [Realtime] vote_item 변화로 인한 데이터 업데이트 시작...');
              updateVoteData(); // 폴링이 아닌 일반 업데이트 함수 사용
            }
            
            // 연결 품질 업데이트
            updateConnectionQuality(true);
          }
        )

        .subscribe((status, err) => {
          console.log(`[Realtime] 📡 구독 상태 변경: ${status}`, err ? { error: err } : '');
          
          if (status === 'SUBSCRIBED') {
            console.log('[Realtime] ✅ 연결 성공! 실시간 업데이트 수신 대기 중...', {
              channel: 'supabase_realtime',
              voteId: vote.id,
              tables: ['vote_item'],
              events: ['*'],
              connectedAt: new Date().toISOString()
            });
            setConnectionState(prev => ({
              ...prev,
              mode: 'realtime',
              isConnected: true,
              errorCount: 0,
              retryCount: 0,
            }));
            
            // 연결 품질 업데이트
            updateConnectionQuality(true);
            
            // 연결 성공 알림
            addNotification({
              type: 'success',
              title: '실시간 연결 성공',
              message: '투표 결과가 실시간으로 업데이트됩니다.',
              duration: 3000,
            });
            
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Realtime] 연결 실패:', err);
            setConnectionState(prev => ({
              ...prev,
              mode: 'polling',
              isConnected: false,
              errorCount: prev.errorCount + 1,
              retryCount: prev.retryCount + 1,
            }));
            
            // 연결 품질 업데이트
            updateConnectionQuality(false);
            
            // 리얼타임 실패시 폴링 모드로 전환 (switchMode를 통해 안전하게 전환)
            console.log('[Realtime] 폴링 모드로 자동 전환');
            // startPollingMode(); // ❌ 삭제: switchMode에서 이미 처리됨
            
            // 연결 실패 알림
            addNotification({
              type: 'warning',
              title: '실시간 연결 실패',
              message: '폴링 모드로 전환되었습니다. 데이터는 계속 업데이트됩니다.',
              duration: 4000,
            });
            
          } else if (status === 'CLOSED') {
            console.log('[Realtime] 연결 종료');
            setConnectionState(prev => ({
              ...prev,
              isConnected: false,
            }));
            
            // 연결이 예기치 않게 종료된 경우 폴링으로 전환 (상태만 변경)
            if (connectionState.mode === 'realtime') {
              console.log('[Realtime] 연결 종료로 인한 폴링 모드 전환');
              setConnectionState(prev => ({
                ...prev,
                mode: 'polling',
                isConnected: false,
              }));
            }
          }
        });
      
      realtimeSubscriptionRef.current = subscription;
      
    } catch (error) {
      console.error('[Realtime] 연결 실패:', error);
      setConnectionState(prev => ({
        ...prev,
        mode: 'polling',
        isConnected: false,
        errorCount: prev.errorCount + 1,
        retryCount: prev.retryCount + 1,
      }));
      
      // 연결 품질 업데이트
      updateConnectionQuality(false);
      
      // 에러 발생시 폴링 모드로 전환 (switchMode를 통해 안전하게 전환)
      // startPollingMode(); // ❌ 삭제: switchMode에서 이미 처리됨
      
      // 에러 알림
      addNotification({
        type: 'error',
        title: '실시간 연결 오류',
        message: '폴링 모드로 전환되었습니다.',
        duration: 4000,
      });
    }
  }, [enableRealtime, vote.id, supabase, connectionState.mode]); // 함수 의존성 제거하여 무한 루프 방지

  // 폴링 중지
  const stopPollingMode = React.useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('⏹️ [Polling] Stopping polling mode');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 하이브리드 모드 시작
  const startHybridMode = React.useCallback(() => {
    console.log('🔀 [Hybrid] Starting hybrid mode', {
      voteId: vote?.id,
      enableRealtime,
      currentMode: connectionState.mode
    });
    setConnectionState(prev => ({
      ...prev,
      mode: 'realtime',
      isConnected: false,
    }));
    
    // 먼저 리얼타임 연결 시도
    connectRealtime();
  }, [connectRealtime]);

  // 리얼타임 연결 해제
  const disconnectRealtime = React.useCallback(() => {
    if (realtimeSubscriptionRef.current) {
      realtimeSubscriptionRef.current.unsubscribe();
      realtimeSubscriptionRef.current = null;
      console.log('[Realtime] 연결 해제');
    }
  }, []);

  // 연결 모니터 정리
  const cleanupConnectionMonitor = React.useCallback(() => {
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
      qualityCheckIntervalRef.current = null;
    }
    if (realtimeRetryTimeoutRef.current) {
      clearTimeout(realtimeRetryTimeoutRef.current);
      realtimeRetryTimeoutRef.current = null;
    }
  }, []);

  // 모드 전환 함수
  const switchMode = React.useCallback((targetMode: DataSourceMode) => {
    const prevMode = connectionState.mode;
    console.log(`[Mode Switch] Switching from ${prevMode} to ${targetMode}`);
    
    // 기존 연결 정리
    if (connectionState.mode === 'realtime') {
      disconnectRealtime();
    } else if (connectionState.mode === 'polling') {
      stopPollingMode();
    }
    
    // 새로운 모드로 전환
    setConnectionState(prev => ({
      ...prev,
      mode: targetMode,
      isConnected: false,
    }));
    
    // 사용자에게 모드 변경 알림
    if (prevMode !== targetMode) {
      notifyConnectionStateChange(prevMode, targetMode);
    }
    
    // 새 모드 시작
    if (targetMode === 'realtime') {
      setPollingStartTime(null); // 리얼타임 모드로 전환시 폴링 시작 시간 초기화
      connectRealtime();
    } else if (targetMode === 'polling') {
      setPollingStartTime(new Date()); // 폴링 모드 시작 시간 기록
      startPollingMode();
    } else {
      setPollingStartTime(null); // 정적 모드로 전환시 폴링 시작 시간 초기화
    }
  }, [connectionState.mode]); // 함수 의존성 제거하여 무한 루프 방지

  // 자동 모드 전환 (에러 발생시)
  React.useEffect(() => {
    if (connectionState.errorCount >= maxRetries) {
      if (connectionState.mode === 'realtime') {
        console.log('[Auto Switch] Realtime -> Polling (에러 한계 도달)');
        switchMode('polling');
      } else if (connectionState.mode === 'polling') {
        console.log('[Auto Switch] Polling -> Static (에러 한계 도달)');
        switchMode('static');
      }
    }
  }, [connectionState.errorCount, connectionState.mode, maxRetries]); // switchMode 의존성 제거하여 무한 루프 방지

  // 연결 모니터링 시스템 초기화 (컴포넌트 마운트 시 한 번만 실행)
  React.useEffect(() => {
    if (enableRealtime) {
      // 하이브리드 모드 시작
      startHybridMode();
      // 연결 품질 모니터링 시작
      startConnectionQualityMonitor();
    } else {
      // 폴링 모드만 사용
      startPollingMode();
    }

    // 정리 함수
    return () => {
      stopPollingMode();
      disconnectRealtime();
      cleanupConnectionMonitor();
    };
  }, [enableRealtime]); // 함수들을 의존성에서 제거하여 무한 루프 방지

  // 남은 시간 계산 및 업데이트
  React.useEffect(() => {
    if (!vote.stop_at || voteStatus !== 'ongoing') return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const endTime = new Date(vote.stop_at!).getTime();
      const difference = endTime - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor(
          (difference % (1000 * 60 * 60)) / (1000 * 60),
        );
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [vote.stop_at, voteStatus]);

  // 투표 기간 포맷팅
  const formatVotePeriod = () => {
    if (!vote.start_at || !vote.stop_at) return '';

    const startDate = new Date(vote.start_at);
    const endDate = new Date(vote.stop_at);

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
  };

  // 타이머 렌더링
  const renderTimer = () => {
    if (voteStatus !== 'ongoing' || !timeLeft) return null;

    const { days, hours, minutes, seconds } = timeLeft;
    const isExpired =
      days === 0 && hours === 0 && minutes === 0 && seconds === 0;

    if (isExpired) {
      return (
        <div className='flex items-center gap-2'>
          <span className='text-xl'>🚫</span>
          <span className='text-sm md:text-base font-bold text-red-600'>
            마감
          </span>
        </div>
      );
    }

    return (
      <div className='flex items-center gap-2'>
        <span className='text-xl'>⏱️</span>
        <div className='flex items-center gap-1 text-xs sm:text-sm font-mono font-bold'>
          {days > 0 && (
            <>
              <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>
                {days}일
              </span>
              <span className='text-gray-400'>:</span>
            </>
          )}
          <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>
            {hours}시
          </span>
          <span className='text-gray-400'>:</span>
          <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>
            {minutes}분
          </span>
          <span className='text-gray-400'>:</span>
          <span className='bg-red-100 text-red-800 px-1.5 py-0.5 rounded animate-pulse text-xs'>
            {seconds}초
          </span>
        </div>
      </div>
    );
  };

  // 연결 상태 표시
  const renderConnectionStatus = () => {
    const getStatusColor = () => {
      switch (connectionState.mode) {
        case 'realtime':
          return connectionState.isConnected ? 'text-green-600' : 'text-yellow-600';
        case 'polling':
          return 'text-blue-600';
        case 'static':
          return 'text-gray-600';
        default:
          return 'text-gray-600';
      }
    };

    const getStatusIcon = () => {
      switch (connectionState.mode) {
        case 'realtime':
          return connectionState.isConnected ? '🟢' : '🟡';
        case 'polling':
          return '🔄';
        case 'static':
          return '⚪';
        default:
          return '⚪';
      }
    };

    const getStatusText = () => {
      switch (connectionState.mode) {
        case 'realtime':
          return connectionState.isConnected ? '실시간' : '연결 중';
        case 'polling':
          return '폴링';
        case 'static':
          return '정적';
        default:
          return '알 수 없음';
      }
    };

    return (
      <div className={`flex items-center gap-1 text-xs ${getStatusColor()}`}>
        <span>{getStatusIcon()}</span>
        <span>{getStatusText()}</span>
        {connectionState.lastUpdate && (
          <span className="text-gray-400">
            ({connectionState.lastUpdate.toLocaleTimeString()})
          </span>
        )}
      </div>
    );
  };

  // 성능 최적화된 투표 아이템 필터링 및 정렬
  const { rankedVoteItems, filteredItems, totalVotes } = React.useMemo(() => {
    // 투표 아이템 순위 매기기
    const ranked = [...voteItems]
      .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
      .map((item, index) => {
        // 리얼타임 정보 추가
        const isHighlighted = recentlyUpdatedItems.has(item.id);
        
        return {
          ...item,
          rank: index + 1,
          _realtimeInfo: {
            isHighlighted,
            isUpdated: isHighlighted,
            rankChange: 'same' as const, // 랭킹 변경 추적을 원하면 이전 순위와 비교 로직 추가
          }
        };
      });

    // 검색 필터링 (디바운싱된 검색어 사용)
    const filtered = debouncedSearchQuery
      ? ranked.filter(item => {
          const artistName = item.artist?.name
            ? getLocalizedString(item.artist.name, currentLanguage)?.toLowerCase() || ''
            : '';
          const query = debouncedSearchQuery.toLowerCase();
          return artistName.includes(query);
        })
      : ranked;

    // 총 투표 수 계산
    const total = voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0);

    return {
      rankedVoteItems: ranked,
      filteredItems: filtered,
      totalVotes: total,
    };
  }, [voteItems, debouncedSearchQuery, currentLanguage, recentlyUpdatedItems]);

  // 투표 제목과 내용 메모이제이션
  const { voteTitle, voteContent } = React.useMemo(() => ({
    voteTitle: getLocalizedString(vote.title, currentLanguage),
    voteContent: getLocalizedString(vote.vote_content, currentLanguage),
  }), [vote.title, vote.vote_content, currentLanguage]);

  // 투표 확인 팝업
  const handleCardClick = async (item: VoteItem) => {
    console.log('🎯 handleCardClick 시작:', {
      canVote,
      itemId: item.id,
      artistId: item.artist_id,
      groupId: item.group_id,
      timestamp: new Date().toISOString(),
    });

    if (!canVote) {
      console.log('❌ canVote가 false - 투표 불가능');
      return;
    }

    console.log('🔐 withAuth 호출 시작...');

    // 인증이 필요한 투표 액션을 실행
    const result = await withAuth(async () => {
      console.log('✅ withAuth 내부 - 인증 성공, 투표 다이얼로그 표시');
      // 인증된 사용자만 여기에 도달
      setVoteCandidate(item);
      setVoteAmount(1); // 투표량 초기화
      setShowVoteModal(true);
      return true;
    });

    console.log('🔍 withAuth 결과:', result);

    // withAuth가 null을 반환하면 인증 실패 (로그인 다이얼로그 표시됨)
    // 인증 성공 시에만 result가 true가 됨
    if (!result) {
      console.log('❌ 인증 실패 - 투표 다이얼로그 표시하지 않음');
    } else {
      console.log('✅ 인증 성공 - 투표 다이얼로그가 표시되어야 함');
    }
  };

  // 투표 실행
  const confirmVote = async () => {
    if (!voteCandidate || voteAmount <= 0 || voteAmount > availableVotes)
      return;

    // 인증이 필요한 투표 액션을 실행
    const result = await withAuth(async () => {
      setIsVoting(true);
      setShowVoteModal(false);
      try {
        // TODO: 실제 투표 API 호출
        console.log('Voting for:', {
          voteId: vote.id,
          itemId: voteCandidate.id,
          amount: voteAmount,
        });

        // 임시로 투표수 증가
        setVoteItems((prev) =>
          prev.map((item) =>
            item.id === voteCandidate.id
              ? { ...item, vote_total: (item.vote_total || 0) + voteAmount }
              : item,
          ),
        );

        // 사용 가능한 투표량 감소
        setAvailableVotes((prev) => prev - voteAmount);
        
        // 투표 성공 알림
        addNotification({
          type: 'success',
          title: '투표 완료',
          message: `${getLocalizedString(voteCandidate.artist?.name || '', currentLanguage)}에게 ${voteAmount}표 투표했습니다.`,
          duration: 3000,
        });
      } catch (error) {
        console.error('Vote error:', error);
        
        // 투표 실패 알림
        addNotification({
          type: 'error',
          title: '투표 실패',
          message: '투표 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
          duration: 4000,
        });
      } finally {
        setIsVoting(false);
        setVoteCandidate(null);
        setVoteAmount(1);
      }
      return true;
    });

    // 인증 실패 시 투표 다이얼로그 유지
    if (!result) {
      console.log('투표 인증 실패 - 다이얼로그 유지');
      // 투표 다이얼로그는 열린 상태로 유지
    }
  };

  // 투표 취소
  const cancelVote = () => {
    setShowVoteModal(false);
    setVoteCandidate(null);
    setVoteAmount(1);
  };

  // 검색 핸들러
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // 헤더 높이 측정
  React.useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);

    const observer = new MutationObserver(updateHeaderHeight);
    if (headerRef.current) {
      observer.observe(headerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    const timer = setTimeout(updateHeaderHeight, 100);

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [voteTitle, voteContent, voteStatus, availableVotes]);

  // 전역 디버깅 함수들 설정
  React.useEffect(() => {
    // @ts-ignore
    window.testHighlight = (itemId?: string | number) => {
      if (!itemId) {
        console.log('💡 [Test] 사용법: window.testHighlight(아이템ID)');
        console.log('예: window.testHighlight(1) 또는 window.testHighlight("1")');
        console.log('현재 하이라이트된 아이템들:', Array.from(recentlyUpdatedItems));
        console.log('활성 타이머 수:', highlightTimersRef.current.size);
        return;
      }
      
      const testId = itemId;
      console.log(`🎨 [Test] 하이라이트 테스트 시작: ${testId}`);
      console.log('현재 하이라이트된 아이템들:', Array.from(recentlyUpdatedItems));
      console.log('활성 타이머 수:', highlightTimersRef.current.size);
      
      setItemHighlight(testId, true, 5000); // 5초 테스트
      
      // 1초 후 상태 확인
      setTimeout(() => {
        console.log('📊 [Test] 1초 후 상태 확인:');
        console.log('  recentlyUpdatedItems:', Array.from(recentlyUpdatedItems));
        console.log('  highlightTimersRef size:', highlightTimersRef.current.size);
      }, 1000);
      
      setTimeout(() => {
        console.log('🎨 [Test] 3초 후 다시 하이라이트 테스트 (중복 처리 확인)');
        setItemHighlight(testId, true, 3000);
      }, 3000);
    };

    // @ts-ignore
    window.clearAllHighlights = () => {
      console.log('🧹 [Test] 모든 하이라이트 즉시 제거');
      highlightTimersRef.current.forEach((timer, itemId) => {
        clearTimeout(timer);
        console.log(`⏰ [Test] 타이머 취소: ${itemId}`);
      });
      highlightTimersRef.current.clear();
      setRecentlyUpdatedItems(new Set());
    };

    // @ts-ignore
    window.debugHighlightStatus = () => {
      console.log('=== 🔍 하이라이트 상태 디버깅 ===');
      console.log('recentlyUpdatedItems:', Array.from(recentlyUpdatedItems));
      console.log('활성 타이머 수:', highlightTimersRef.current.size);
      console.log('타이머 목록:', Array.from(highlightTimersRef.current.keys()));
    };

    // @ts-ignore
    window.testRealtime = () => {
      console.log('🔧 [Guide] 리얼타임 테스트 가이드');
      console.log('');
      console.log('1. 하이라이트 테스트:');
      console.log('   window.testHighlight(1)     // 아이템 ID 1 테스트');
      console.log('   window.testHighlight("2")   // 아이템 ID 2 테스트');
      console.log('');
      console.log('2. 상태 확인:');
      console.log('   window.debugHighlightStatus()    // 하이라이트 상태');
      console.log('   window.checkRealtimeStatus()     // 리얼타임 전체 상태');
      console.log('');
      console.log('3. 하이라이트 제거:');
      console.log('   window.clearAllHighlights()      // 모든 하이라이트 제거');
      console.log('');
      console.log('4. 리얼타임 테스트:');
      console.log('   window.testSupabaseRealtime()    // Supabase 연결 테스트');
      console.log('   window.testDatabaseDirectly()    // DB 업데이트 테스트');
      console.log('');
      console.log('💡 페이지에서 아이템 ID를 확인한 후 window.testHighlight(ID)로 테스트하세요!');
    };

    return () => {
      // cleanup 시 전역 함수들 제거
      // @ts-ignore
      delete window.testHighlight;
      // @ts-ignore
      delete window.clearAllHighlights;
      // @ts-ignore
      delete window.debugHighlightStatus;
      // @ts-ignore
      delete window.testRealtime;
    };
  }, [recentlyUpdatedItems, setItemHighlight, highlightTimersRef, setRecentlyUpdatedItems]);

  // 연결 품질 모니터링
  const startConnectionQualityMonitor = React.useCallback(() => {
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
    }

    qualityCheckIntervalRef.current = setInterval(() => {
      console.log(`[Quality Monitor] Current quality score: ${connectionQuality.score}`);
      
      // 품질이 임계값 이하로 떨어지면 폴링 모드로 전환
      if (connectionState.mode === 'realtime' && connectionQuality.score < thresholds.minConnectionQuality) {
        console.log(`[Quality Monitor] Quality too low (${connectionQuality.score}), switching to polling`);
        switchMode('polling');
      }
      
      // 연속 에러가 임계값을 초과하면 모드 전환
      if (connectionQuality.consecutiveErrors >= thresholds.maxConsecutiveErrors) {
        if (connectionState.mode === 'realtime') {
          console.log(`[Quality Monitor] Too many consecutive errors (${connectionQuality.consecutiveErrors}), switching to polling`);
          switchMode('polling');
        }
      }
      
      // 품질이 좋아지면 리얼타임 모드 재시도 (더 엄격한 조건)
      if (connectionState.mode === 'polling' && 
          connectionQuality.score > thresholds.minConnectionQuality + 20 && // 90점 이상 요구
          connectionQuality.consecutiveSuccesses >= 15 && // 15초간 연속 성공 요구
          connectionQuality.errorRate < 0.1 && // 에러율 10% 미만
          pollingStartTime && // 폴링 시작 시간이 기록되어 있어야 함
          Date.now() - pollingStartTime.getTime() > 60000) { // 최소 1분간 폴링 모드 유지
        console.log(`[Quality Monitor] Quality significantly improved after sufficient polling time (${connectionQuality.score}, successes: ${connectionQuality.consecutiveSuccesses}), attempting realtime reconnection`);
        attemptRealtimeReconnection();
      }
    }, thresholds.qualityCheckInterval);
  }, [connectionQuality, connectionState.mode, thresholds]);

  // 리얼타임 재연결 시도
  const attemptRealtimeReconnection = React.useCallback(() => {
    if (realtimeRetryTimeoutRef.current) {
      clearTimeout(realtimeRetryTimeoutRef.current);
    }

    console.log('[Reconnection] Attempting realtime reconnection...');
    realtimeRetryTimeoutRef.current = setTimeout(() => {
      if (connectionState.mode === 'polling') {
        switchMode('realtime');
      }
    }, thresholds.realtimeRetryDelay);
  }, [connectionState.mode, thresholds.realtimeRetryDelay]);

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 ${className}`}
    >
      {/* 헤더 정보 */}
      <div
        ref={headerRef}
        className='sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-lg mb-2'
      >
        <div className='relative overflow-hidden'>
          <div className='absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-10'></div>
          <div className='border-0 bg-white/80 backdrop-blur-sm rounded-lg p-4'>
            <div className='pb-2'>
              <div className='flex items-start justify-between gap-2 mb-1'>
                <h1 className='text-base md:text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex-1 min-w-0'>
                  {voteTitle}
                </h1>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs rounded-full font-medium ${
                      voteStatus === 'ongoing'
                        ? 'bg-green-100 text-green-800'
                        : voteStatus === 'upcoming'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {voteStatus === 'ongoing' ? '진행 중' :
                     voteStatus === 'upcoming' ? '예정' : '종료'}
                  </span>
                  {renderConnectionStatus()}
                </div>
              </div>
              
              <div className='flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600 mb-2'>
                <span>📅 {formatVotePeriod()}</span>
                <span className="hidden sm:inline">•</span>
                <span>👥 총 {totalVotes.toLocaleString()} 표</span>
                <span className="hidden sm:inline">•</span>
                <span>🏆 {filteredItems.length}명 참여</span>
              </div>

              {/* 타이머 */}
              <div className="flex items-center justify-between">
                {renderTimer()}
                
                {/* 개발 모드에서 수동 모드 전환 버튼 */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => switchMode('realtime')}
                      className={`px-2 py-1 text-xs rounded ${
                        connectionState.mode === 'realtime' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      실시간
                    </button>
                    <button
                      onClick={() => switchMode('polling')}
                      className={`px-2 py-1 text-xs rounded ${
                        connectionState.mode === 'polling' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      폴링
                    </button>
                    <button
                      onClick={() => switchMode('static')}
                      className={`px-2 py-1 text-xs rounded ${
                        connectionState.mode === 'static' 
                          ? 'bg-gray-100 text-gray-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      정적
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 검색 */}
      <div className="px-4 mb-4">
        <VoteSearch 
          onSearch={handleSearch}
          placeholder={`${rankedVoteItems.length}명 중 검색...`}
          totalItems={rankedVoteItems.length}
          searchResults={filteredItems}
          disabled={!canVote}
        />
      </div>

      {/* 상위 3위 표시 */}
      {voteStatus !== 'upcoming' && rankedVoteItems.length > 0 && (
        <div
          className='sticky z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 py-2 md:py-3 mb-2 md:mb-4 shadow-lg'
          style={{ top: `${headerHeight}px` }}
        >
          <div className='container mx-auto px-4'>
            <div className='text-center mb-2 md:mb-3'>
              <div className='flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4'>
                <h2 className='text-lg md:text-xl font-bold bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-500 bg-clip-text text-transparent'>
                  🏆 TOP 3
                </h2>

                {/* 타이머 */}
                <div className='flex items-center gap-3'>{renderTimer()}</div>
              </div>
            </div>

            {/* 포디움 스타일 레이아웃 - 더 컴팩트 */}
            <div className='flex justify-center items-end w-full max-w-4xl gap-1 sm:gap-2 md:gap-4 px-2 sm:px-4 mx-auto'>
              {/* 2위 */}
              {rankedVoteItems[1] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                      <VoteRankCard
                        item={rankedVoteItems[1]}
                        rank={2}
                        className='w-20 sm:w-24 md:w-28 lg:w-32'
                        voteTotal={rankedVoteItems[1].vote_total || 0}
                        enableMotionAnimations={true}
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-sm'>🥈</div>
                  </div>
                </div>
              )}

              {/* 1위 */}
              {rankedVoteItems[0] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10'>
                  <div className='relative'>
                    <div className='absolute -inset-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                    <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                      <div className='absolute -top-0.5 -right-0.5 text-sm animate-bounce'>
                        👑
                      </div>
                      <VoteRankCard
                        item={rankedVoteItems[0]}
                        rank={1}
                        className='w-24 sm:w-32 md:w-36 lg:w-40'
                        voteTotal={rankedVoteItems[0].vote_total || 0}
                        enableMotionAnimations={true}
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-base font-bold animate-pulse'>🥇</div>
                  </div>
                </div>
              )}

              {/* 3위 */}
              {rankedVoteItems[2] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                      <VoteRankCard
                        item={rankedVoteItems[2]}
                        rank={3}
                        className='w-18 sm:w-20 md:w-24 lg:w-28'
                        voteTotal={rankedVoteItems[2].vote_total || 0}
                        enableMotionAnimations={true}
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-sm'>🥉</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 투표 아이템 그리드 - 개선된 반응형 */}
      <div className='container mx-auto px-4 pb-8'>
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3 md:gap-4'>
          {filteredItems.map((item, index) => {
            const artistName = item.artist?.name
              ? getLocalizedString(item.artist.name, currentLanguage) ||
                '아티스트'
              : '아티스트';
            const imageUrl = item.artist?.image
              ? getCdnImageUrl(item.artist.image)
              : '/images/default-artist.png';

            return (
              <div
                key={item.id}
                className='transform transition-all duration-300 hover:scale-105 hover:-translate-y-2'
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
                onClick={() => {
                  console.log('🖱️ [HybridVoteDetailPresenter] 카드 클릭됨:', {
                    canVote,
                    itemId: item.id,
                    artistName: artistName,
                    timestamp: new Date().toISOString(),
                  });

                  if (canVote) {
                    handleCardClick(item);
                  } else {
                    console.log('❌ canVote가 false - 클릭 무시됨');
                  }
                }}
              >
                <Card
                  hoverable={canVote}
                  className={`
                    group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl 
                    transition-all duration-300 cursor-pointer
                    ${
                      !canVote
                        ? 'opacity-75 grayscale cursor-not-allowed'
                        : 'hover:shadow-blue-200/50 hover:shadow-xl'
                    }
                    ${
                      item.rank <= 3
                        ? 'ring-2 ring-yellow-400/50 bg-gradient-to-br from-yellow-50/50 to-orange-50/50'
                        : 'bg-gradient-to-br from-white to-blue-50/30'
                    }
                    backdrop-blur-sm
                  `}
                >
                  {/* 순위 배지 */}
                  {item.rank && item.rank <= 10 && (
                    <div
                      className={`
                      absolute top-1 left-1 z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-full 
                      flex items-center justify-center text-xs font-bold text-white shadow-lg
                      ${
                        item.rank === 1
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 animate-pulse'
                          : item.rank === 2
                          ? 'bg-gradient-to-br from-gray-400 to-gray-600'
                          : item.rank === 3
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                          : 'bg-gradient-to-br from-blue-500 to-purple-600'
                      }
                    `}
                    >
                      {item.rank}
                    </div>
                  )}

                  {/* 사용자 투표 상태 표시 */}
                  {userVote && userVote.allVoteItems && userVote.allVoteItems.includes(item.id) ? (
                    <div className='absolute top-1 right-1 z-10'>
                      <div className='bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs px-1.5 py-0.5 rounded-full shadow-lg flex items-center gap-1'>
                        <span>✓</span>
                        {userVote.voteCount > 1 && (
                          <span className="text-xs">
                            {userVote.votes?.filter(v => v.vote_item_id === item.id).reduce((sum, v) => sum + (v.amount || 0), 0) || 0}표
                          </span>
                        )}
                      </div>
                    </div>
                  ) : canVote ? (
                    <div className='absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                      <div className='bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full shadow-lg'>
                        투표
                      </div>
                    </div>
                  ) : null}

                  {/* 투표 중 오버레이 */}
                  {isVoting && voteCandidate?.id === item.id && (
                    <div className='absolute inset-0 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center z-20'>
                      <div className='bg-white rounded-full p-2 shadow-xl'>
                        <div className='w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin'></div>
                      </div>
                    </div>
                  )}

                  <Card.Body className='p-1.5'>
                    <div className='text-center'>
                      <div className='relative mb-1.5 group'>
                        <div className='relative w-full aspect-square bg-gray-100 rounded overflow-hidden'>
                          <img
                            src={imageUrl}
                            alt={artistName}
                            className='w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:brightness-110'
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = '/images/default-artist.png';
                              target.onerror = null;
                            }}
                          />
                          {/* 이미지 오버레이 효과 */}
                          <div className='absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
                        </div>
                      </div>

                      <h3 className='font-bold text-xs mb-0.5 line-clamp-1 group-hover:text-blue-600 transition-colors'>
                        {artistName}
                      </h3>

                      {item.artist?.artistGroup?.name && (
                        <p className='text-xs text-gray-500 mb-0.5 line-clamp-1 group-hover:text-gray-700 transition-colors'>
                          {getLocalizedString(
                            item.artist.artistGroup.name,
                            currentLanguage,
                          )}
                        </p>
                      )}

                      <div className='space-y-0.5'>
                        <p className='text-xs sm:text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent'>
                          {(item.vote_total || 0).toLocaleString()}
                          <span className='text-xs text-gray-500 ml-0.5'>
                            표
                          </span>
                        </p>

                        {item.rank && (
                          <div className='flex items-center justify-center gap-0.5'>
                            {item.rank <= 3 && (
                              <span className='text-xs'>
                                {item.rank === 1
                                  ? '🥇'
                                  : item.rank === 2
                                  ? '🥈'
                                  : '🥉'}
                              </span>
                            )}
                            <span className='text-xs text-gray-500 font-medium'>
                              {item.rank}위
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card.Body>

                  {/* 하단 그라데이션 장식 */}
                  <div
                    className={`
                    absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    ${
                      item.rank <= 3
                        ? 'from-yellow-400 via-orange-500 to-red-500'
                        : 'from-blue-500 via-purple-500 to-pink-500'
                    }
                  `}
                  ></div>
                </Card>
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className='text-center py-16'>
            <div className='text-6xl mb-4'>🔍</div>
            <p className='text-xl text-gray-500 font-medium'>
              검색 결과가 없습니다.
            </p>
            <p className='text-sm text-gray-400 mt-2'>
              다른 검색어를 시도해보세요.
            </p>
          </div>
        )}
      </div>

      {/* 투표 확인 팝업 */}
      {showVoteModal && voteCandidate && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl transform animate-in zoom-in-95 duration-200'>
            {/* 후보자 정보 */}
            <div className='text-center mb-6'>
              <div className='w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden ring-4 ring-blue-100'>
                <img
                  src={
                    voteCandidate.artist?.image
                      ? getCdnImageUrl(voteCandidate.artist.image)
                      : '/images/default-artist.png'
                  }
                  alt={
                    voteCandidate.artist?.name
                      ? getLocalizedString(
                          voteCandidate.artist.name,
                          currentLanguage,
                        )
                      : '아티스트'
                  }
                  className='w-full h-full object-cover'
                />
              </div>
              <h3 className='text-lg font-bold text-gray-800 mb-1'>
                {voteCandidate.artist?.name
                  ? getLocalizedString(
                      voteCandidate.artist.name,
                      currentLanguage,
                    )
                  : '아티스트'}
              </h3>
              {voteCandidate.artist?.artistGroup?.name && (
                <p className='text-sm text-gray-500'>
                  {getLocalizedString(
                    voteCandidate.artist.artistGroup.name,
                    currentLanguage,
                  )}
                </p>
              )}
              {(() => {
                const rankedItem = rankedVoteItems.find(
                  (item) => item.id === voteCandidate.id,
                );
                return (
                  rankedItem?.rank && (
                    <div className='mt-2 flex items-center justify-center gap-1'>
                      {rankedItem.rank <= 3 && (
                        <span className='text-lg'>
                          {rankedItem.rank === 1
                            ? '🥇'
                            : rankedItem.rank === 2
                            ? '🥈'
                            : '🥉'}
                        </span>
                      )}
                      <span className='text-sm font-semibold text-gray-600'>
                        현재 {rankedItem.rank}위
                      </span>
                    </div>
                  )
                );
              })()}
            </div>

            {/* 확인 메시지 */}
            <div className='text-center mb-6'>
              <h2 className='text-xl font-bold text-gray-800 mb-2'>
                투표 확인
              </h2>
              <p className='text-gray-600'>이 후보에게 투표하시겠습니까?</p>
              <p className='text-sm text-gray-500 mt-1'>
                투표는 한 번만 가능합니다.
              </p>
            </div>

            {/* 투표량 선택 */}
            <div className='mb-6'>
              <div className='flex items-center justify-between mb-3'>
                <label className='text-sm font-semibold text-gray-700'>
                  투표량
                </label>
                <span className='text-xs text-gray-500'>
                  보유: {availableVotes}표
                </span>
              </div>

              <div className='flex items-center gap-3'>
                <button
                  onClick={() => setVoteAmount(Math.max(1, voteAmount - 1))}
                  disabled={voteAmount <= 1}
                  className='w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-600 transition-colors'
                >
                  −
                </button>

                <div className='flex-1 text-center'>
                  <input
                    type='number'
                    min='1'
                    max={availableVotes}
                    value={voteAmount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setVoteAmount(
                        Math.min(availableVotes, Math.max(1, value)),
                      );
                    }}
                    className='w-full text-center text-lg font-bold border-2 border-gray-200 rounded-lg py-2 focus:border-blue-500 focus:outline-none'
                  />
                  <div className='text-xs text-gray-500 mt-1'>표</div>
                </div>

                <button
                  onClick={() =>
                    setVoteAmount(Math.min(availableVotes, voteAmount + 1))
                  }
                  disabled={voteAmount >= availableVotes}
                  className='w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-600 transition-colors'
                >
                  +
                </button>
              </div>

              {/* 빠른 선택 버튼 */}
              <div className='flex gap-2 mt-3'>
                {[1, 5, Math.min(10, availableVotes), availableVotes]
                  .filter(
                    (val, idx, arr) => arr.indexOf(val) === idx && val > 0,
                  )
                  .map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setVoteAmount(amount)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        voteAmount === amount
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      {amount}표
                    </button>
                  ))}
              </div>
            </div>

            {/* 버튼 */}
            <div className='flex gap-3'>
              <button
                onClick={cancelVote}
                className='flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors duration-200'
              >
                취소
              </button>
              <button
                onClick={confirmVote}
                disabled={
                  isVoting || voteAmount <= 0 || voteAmount > availableVotes
                }
                className='flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isVoting ? (
                  <div className='flex items-center justify-center gap-2'>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
                    투표 중...
                  </div>
                ) : (
                  `${voteAmount}표 투표하기`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 알림 시스템 */}
      <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`
              p-4 rounded-lg shadow-lg border-l-4 bg-white transform transition-all duration-300 ease-in-out
              ${notification.type === 'success' ? 'border-green-500 bg-green-50' : ''}
              ${notification.type === 'error' ? 'border-red-500 bg-red-50' : ''}
              ${notification.type === 'warning' ? 'border-yellow-500 bg-yellow-50' : ''}
              ${notification.type === 'info' ? 'border-blue-500 bg-blue-50' : ''}
            `}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <h4 className={`
                  font-medium text-sm
                  ${notification.type === 'success' ? 'text-green-800' : ''}
                  ${notification.type === 'error' ? 'text-red-800' : ''}
                  ${notification.type === 'warning' ? 'text-yellow-800' : ''}
                  ${notification.type === 'info' ? 'text-blue-800' : ''}
                `}>
                  {notification.title}
                </h4>
                <p className={`
                  text-xs mt-1
                  ${notification.type === 'success' ? 'text-green-700' : ''}
                  ${notification.type === 'error' ? 'text-red-700' : ''}
                  ${notification.type === 'warning' ? 'text-yellow-700' : ''}
                  ${notification.type === 'info' ? 'text-blue-700' : ''}
                `}>
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className={`
                  text-xs hover:opacity-70 transition-opacity
                  ${notification.type === 'success' ? 'text-green-800' : ''}
                  ${notification.type === 'error' ? 'text-red-800' : ''}
                  ${notification.type === 'warning' ? 'text-yellow-800' : ''}
                  ${notification.type === 'info' ? 'text-blue-800' : ''}
                `}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 리워드 섹션 (있는 경우) */}
      {rewards.length > 0 && (
        <section className="px-4 pb-8">
          <h2 className="text-xl font-semibold mb-4">🎁 투표 리워드</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rewards.map((reward, index) => (
              <div key={reward.id || index} className="border rounded-lg p-4">
                <p>리워드 #{index + 1}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 개발 모드 디버그 정보 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-xs max-w-sm space-y-3">
          <h4 className="font-semibold mb-2 text-yellow-300">🔧 하이브리드 시스템 디버거</h4>
          
          {/* 연결 상태 */}
          <div className="space-y-1 mb-3">
            <p className="text-green-300">📊 현재 상태:</p>
            <p>• 모드: <span className="text-cyan-300 font-mono">{connectionState.mode}</span></p>
            <p>• 연결: {connectionState.isConnected ? '✅' : '❌'}</p>
            <p>• 에러 수: <span className="text-red-300">{connectionState.errorCount}</span></p>
            <p>• 재시도: <span className="text-yellow-300">{connectionState.retryCount}</span></p>
            <p>• 마지막 업데이트: <span className="text-blue-300">{connectionState.lastUpdate?.toLocaleTimeString() || 'None'}</span></p>
            {connectionState.mode === 'polling' && pollingStartTime && (
              <p>• 폴링 지속시간: <span className="text-purple-300">{Math.floor((Date.now() - pollingStartTime.getTime()) / 1000)}초</span></p>
            )}
          </div>

          {/* 데이터 상태 */}
          <div className="space-y-1 mb-3">
            <p className="text-green-300">📋 데이터:</p>
            <p>• 총 아이템: <span className="text-cyan-300">{voteItems.length}</span></p>
            <p>• 필터된 아이템: <span className="text-cyan-300">{filteredItems.length}</span></p>
            <p>• 검색어: <span className="text-yellow-300">&quot;{searchQuery}&quot;</span></p>
            {user && (
              <p>• 사용자: <span className="text-green-300">로그인됨</span></p>
            )}
            {userVote && (
              <>
                <p>• 내 투표 횟수: <span className="text-yellow-300">{userVote.voteCount}회</span></p>
                <p>• 총 투표량: <span className="text-yellow-300">{userVote.totalVotes}표</span></p>
                <p>• 투표한 아이템: <span className="text-cyan-300">{userVote.allVoteItems?.length || 0}개</span></p>
              </>
            )}
          </div>

          {/* 연결 품질 정보 */}
          <div className="space-y-1 mb-3">
            <p className="text-green-300">📶 연결 품질:</p>
            <p>• 점수: <span className="text-cyan-300">{connectionQuality.score.toFixed(0)}/100</span></p>
            <p>• 에러율: <span className="text-red-300">{(connectionQuality.errorRate * 100).toFixed(1)}%</span></p>
            <p>• 연속 에러: <span className="text-red-300">{connectionQuality.consecutiveErrors}</span></p>
            <p>• 연속 성공: <span className="text-green-300">{connectionQuality.consecutiveSuccesses}</span></p>
          </div>

          {/* 수동 컨트롤 */}
          <div className="space-y-2">
            <p className="text-green-300">🎛️ 수동 제어:</p>
            <div className="flex gap-1">
              <button
                onClick={() => switchMode('realtime')}
                className={`px-2 py-1 text-xs rounded font-mono ${
                  connectionState.mode === 'realtime' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                RT
              </button>
              <button
                onClick={() => switchMode('polling')}
                className={`px-2 py-1 text-xs rounded font-mono ${
                  connectionState.mode === 'polling' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                Poll
              </button>
              <button
                onClick={() => switchMode('static')}
                className={`px-2 py-1 text-xs rounded font-mono ${
                  connectionState.mode === 'static' 
                    ? 'bg-gray-600 text-white' 
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}
              >
                Static
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => updateVoteDataPolling()}
                className="px-2 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-mono"
              >
                수동 새로고침
              </button>
              <button
                onClick={() => {
                  console.clear();
                  console.log('[Debug] 콘솔 클리어됨');
                }}
                className="px-2 py-1 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-mono"
              >
                콘솔 클리어
              </button>
            </div>
          </div>

          {/* 실시간 로그 */}
          <div className="border-t border-gray-600 pt-2 text-xs">
            <p className="text-green-300">📝 실시간 상태:</p>
            <p className="text-gray-300 font-mono">
              {connectionState.mode === 'realtime' ? '🔴 실시간 모드 활성' : 
               connectionState.mode === 'polling' ? '🔵 폴링 모드 활성' : 
               '⚪ 정적 모드'}
            </p>
            <p className="text-gray-300 font-mono text-xs">
              Last update: {lastPollingUpdate?.toLocaleTimeString() || 'N/A'}
            </p>
            {connectionState.mode === 'polling' && (
              <p className="text-yellow-300 font-mono text-xs">
                ⚡ {pollingErrorCount === 0 ? '안정적 폴링' : `에러 ${pollingErrorCount}회`}
              </p>
            )}
            {process.env.NODE_ENV === 'development' && (
              <p className="text-blue-300 font-mono text-xs">
                🔧 로그: 5초마다 축약 출력
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 브라우저 콘솔에서 리얼타임 테스트용 전역 함수 등록 (개발 모드에서만)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // @ts-ignore
  window.testRealtime = () => {
    console.log('=== 🔧 리얼타임 테스트 함수 ===');
    console.log('브라우저 콘솔에서 다음 함수들을 사용할 수 있습니다:');
    console.log('• window.testRealtime() - 현재 리얼타임 상태 확인');
    console.log('• window.checkRealtimeStatus() - 종합 상태 진단');
    console.log('• window.testSupabaseRealtime() - Supabase 리얼타임 연결 테스트 (10초)');
    console.log('• window.testDatabaseDirectly() - 데이터베이스 직접 업데이트 테스트');
    console.log('• window.forceRealtimeReconnect() - 강제 리얼타임 재연결 (컴포넌트 내부)');
    console.log('• window.switchToPolling() - 폴링 모드로 전환 (컴포넌트 내부)');
    console.log('• window.switchToRealtime() - 리얼타임 모드로 전환 (컴포넌트 내부)');
    console.log('=== 📋 테스트 순서 추천 ===');
    console.log('1. window.checkRealtimeStatus() 실행 (종합 진단)');
    console.log('2. window.testSupabaseRealtime() 실행 (연결 확인)');
    console.log('3. window.testDatabaseDirectly() 실행 (DB 업데이트)');
    console.log('4. 또는 SQL Editor에서: SELECT test_realtime_update(83);');
    console.log('=== 🚨 문제 해결 가이드 ===');
    console.log('만약 리얼타임이 작동하지 않는다면:');
    console.log('1. Supabase 대시보드 → Settings → API → Realtime API 활성화 확인');
    console.log('2. 테이블의 RLS 정책이 리얼타임을 차단하는지 확인');
    console.log('3. 네트워크/방화벽이 WebSocket을 차단하는지 확인');
    console.log('4. 브라우저 확장 프로그램(ad-blocker 등) 비활성화 후 테스트');
    console.log('=== 현재 환경에서는 컴포넌트 내부 상태에 직접 접근할 수 없습니다 ===');
    console.log('페이지를 새로고침한 후 다시 시도해주세요.');
  };




} 