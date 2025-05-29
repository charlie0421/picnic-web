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

  // 기존 상태들
  const [voteItems, setVoteItems] = React.useState<VoteItem[]>(initialItems);
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

  // 임계값 설정
  const thresholds: ThresholdConfig = {
    maxErrorCount: 3,
    maxConsecutiveErrors: 2,
    minConnectionQuality: 70,
    realtimeRetryDelay: 5000, // 5초
    pollingInterval: 1000, // 1초
    qualityCheckInterval: 10000, // 10초
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

    const startTime = performance.now();
    requestStartTimeRef.current = startTime;

    try {
      console.log('[Polling] Fetching vote data...');
      
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
            vote_total,
            created_at,
            updated_at,
            artist:artist_id (
              id,
              name,
              image
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
        console.log('[Polling] Vote data received:', voteData);
        
        // Transform the data to match our types
        const transformedVoteItems = (voteData.vote_item || []).map((item: any) => ({
          id: item.id,
          name: item.artist?.name || 'Unknown',
          image_url: item.artist?.image || '',
          total_votes: item.vote_total || 0,
          created_at: item.created_at,
          updated_at: item.updated_at,
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
          .select('vote_item_id')
          .eq('vote_id', vote.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (userVoteError) {
          console.error('[Polling] User vote fetch error:', userVoteError);
          updateConnectionQuality(false);
        } else {
          setUserVote(userVoteData);
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

  // 데이터 업데이트 함수
  const updateVoteData = React.useCallback(async () => {
    try {
      // TODO: 실제 API 호출로 데이터 가져오기
      // const { data } = await supabase.from('vote_item').select('*').eq('vote_id', vote.id);
      // setVoteItems(data || []);
      
      setConnectionState(prev => ({
        ...prev,
        lastUpdate: new Date(),
        errorCount: 0,
      }));
      
      console.log(`[${connectionState.mode}] 데이터 업데이트 완료:`, new Date().toLocaleTimeString());
    } catch (error) {
      console.error(`[${connectionState.mode}] 데이터 업데이트 실패:`, error);
      setConnectionState(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1,
      }));
    }
  }, [vote.id, connectionState.mode]);

  // 폴링 시작
  const startPollingMode = React.useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log('🔄 [Polling] Starting polling mode (1s interval)');
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
    if (!enableRealtime) return;

    try {
      console.log('[Realtime] 연결 시도 중...');
      
      // 실제 Supabase 리얼타임 연결
      const subscription = supabase
        .channel(`vote_${vote.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vote_item',
            filter: `vote_id=eq.${vote.id}`,
          },
          (payload) => {
            console.log('[Realtime] 업데이트 수신:', payload);
            // 리얼타임 업데이트시 폴링 함수 재사용
            updateVoteDataPolling();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vote_pick',
            filter: `vote_id=eq.${vote.id}`,
          },
          (payload) => {
            console.log('[Realtime] 투표 픽 업데이트 수신:', payload);
            // 투표 픽 변경시도 데이터 업데이트
            updateVoteDataPolling();
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Realtime] 연결 성공');
            setConnectionState(prev => ({
              ...prev,
              mode: 'realtime',
              isConnected: true,
              errorCount: 0,
              retryCount: 0,
            }));
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[Realtime] 연결 실패:', err);
            setConnectionState(prev => ({
              ...prev,
              mode: 'polling',
              isConnected: false,
              errorCount: prev.errorCount + 1,
              retryCount: prev.retryCount + 1,
            }));
            // 리얼타임 실패시 폴링 모드로 전환
            startPollingMode();
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
      // 에러 발생시 폴링 모드로 전환
      startPollingMode();
    }
  }, [enableRealtime, vote.id, supabase, updateVoteDataPolling, startPollingMode]);

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
    console.log('🔀 [Hybrid] Starting hybrid mode');
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
      connectRealtime();
    } else if (targetMode === 'polling') {
      startPollingMode();
    }
  }, [connectionState.mode, disconnectRealtime, stopPollingMode, connectRealtime, startPollingMode, notifyConnectionStateChange]);

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
  }, [connectionState.errorCount, connectionState.mode, maxRetries, switchMode]);

  // 연결 모니터링 시스템 초기화
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
  }, [enableRealtime, startHybridMode, startPollingMode, stopPollingMode, disconnectRealtime, cleanupConnectionMonitor]);

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
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

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
  }, [voteItems, debouncedSearchQuery, currentLanguage]);

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
      
      // 품질이 좋아지면 리얼타임 모드 재시도
      if (connectionState.mode === 'polling' && 
          connectionQuality.score > thresholds.minConnectionQuality + 10 && 
          connectionQuality.consecutiveSuccesses >= 5) {
        console.log(`[Quality Monitor] Quality improved (${connectionQuality.score}), attempting realtime reconnection`);
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
        />
      </div>

      {/* 상위 3위 표시 */}
      {voteStatus !== 'upcoming' && filteredItems.length > 0 && (
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
              {filteredItems[1] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                      <VoteRankCard
                        item={{
                          ...filteredItems[1],
                          image_url: filteredItems[1].artist?.image ? `https://cdn.picnic.fan/picnic/${filteredItems[1].artist.image}` : '',
                          total_votes: filteredItems[1].vote_total || 0,
                          rank: 2
                        }}
                        rank={2}
                        className='w-20 sm:w-24 md:w-28 lg:w-32'
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-sm'>🥈</div>
                  </div>
                </div>
              )}

              {/* 1위 */}
              {filteredItems[0] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10'>
                  <div className='relative'>
                    <div className='absolute -inset-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                    <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                      <div className='absolute -top-0.5 -right-0.5 text-sm animate-bounce'>
                        👑
                      </div>
                      <VoteRankCard
                        item={{
                          ...filteredItems[0],
                          image_url: filteredItems[0].artist?.image ? `https://cdn.picnic.fan/picnic/${filteredItems[0].artist.image}` : '',
                          total_votes: filteredItems[0].vote_total || 0,
                          rank: 1
                        }}
                        rank={1}
                        className='w-24 sm:w-32 md:w-36 lg:w-40'
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-base font-bold animate-pulse'>🥇</div>
                  </div>
                </div>
              )}

              {/* 3위 */}
              {filteredItems[2] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                      <VoteRankCard
                        item={{
                          ...filteredItems[2],
                          image_url: filteredItems[2].artist?.image ? `https://cdn.picnic.fan/picnic/${filteredItems[2].artist.image}` : '',
                          total_votes: filteredItems[2].vote_total || 0,
                          rank: 3
                        }}
                        rank={3}
                        className='w-18 sm:w-20 md:w-24 lg:w-28'
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

      {/* 투표 가능한 썸네일 그리드 (4위 이하) */}
      <div className="px-4 pb-8">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {filteredItems.slice(3).map((item, index) => {
            const actualRank = index + 4; // 4위부터 시작
            return (
              <div
                key={item.id}
                className="relative group cursor-pointer transform transition-all duration-300 hover:scale-105"
                style={{
                  animationDelay: `${index * 30}ms`,
                }}
                onClick={() => handleCardClick(item)}
              >
                {/* 순위 표시 */}
                <div className="absolute -top-2 -left-2 z-10">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white
                    ${actualRank <= 6 ? 'bg-blue-500' : 
                      actualRank <= 10 ? 'bg-purple-500' : 'bg-gray-500'}
                  `}>
                    {actualRank}
                  </div>
                </div>
                
                {/* 아티스트 이미지 */}
                <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                  {item.artist?.image ? (
                    <img 
                      src={`https://cdn.picnic.fan/picnic/${item.artist.image}`}
                      alt={getLocalizedString(item.artist.name, currentLanguage)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-400 text-xs">No Image</span>
                    </div>
                  )}
                </div>
                
                {/* 아티스트 정보 */}
                <div className="mt-1 text-center">
                  <p className="text-xs font-medium text-gray-800 truncate">
                    {item.artist?.name ? 
                      getLocalizedString(item.artist.name, currentLanguage) :
                      '알 수 없음'
                    }
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.artist?.artist_group ? 
                      getLocalizedString(item.artist.artist_group, currentLanguage) :
                      ''
                    }
                  </p>
                  <p className="text-xs font-bold text-blue-600 mt-1">
                    {item.vote_total?.toLocaleString() || 0}표
                  </p>
                </div>
                
                {/* 호버 효과 */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-300 rounded-lg flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="bg-white text-gray-800 px-2 py-1 rounded text-xs font-medium">
                      투표하기
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-3 rounded-lg text-xs max-w-xs">
          <h4 className="font-semibold mb-1">🔧 하이브리드 시스템 상태</h4>
          <div className="space-y-1">
            <p>모드: {connectionState.mode}</p>
            <p>연결: {connectionState.isConnected ? '✅' : '❌'}</p>
            <p>에러 수: {connectionState.errorCount}</p>
            <p>재시도: {connectionState.retryCount}</p>
            <p>마지막 업데이트: {connectionState.lastUpdate?.toLocaleTimeString() || 'None'}</p>
            <p>총 아이템: {voteItems.length}</p>
            <p>필터된 아이템: {filteredItems.length}</p>
          </div>
        </div>
      )}
    </div>
  );
} 