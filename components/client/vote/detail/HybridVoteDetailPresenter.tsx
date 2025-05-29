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
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
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
  const [voteItems, setVoteItems] = useState<VoteItem[]>(initialItems);
  const [selectedItem, setSelectedItem] = useState<VoteItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voteCandidate, setVoteCandidate] = useState<VoteItem | null>(null);
  const [voteAmount, setVoteAmount] = useState(1);
  const [availableVotes, setAvailableVotes] = useState(10);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // 사용자 관련 상태
  const [user, setUser] = useState<any>(null);
  const [userVote, setUserVote] = useState<any>(null);

  // 알림 시스템 상태
  const [notifications, setNotifications] = useState<NotificationState[]>([]);

  // 하이브리드 시스템 상태
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    mode: enableRealtime ? 'realtime' : 'static',
    isConnected: false,
    lastUpdate: null,
    errorCount: 0,
    retryCount: 0,
  });

  // 연결 품질 모니터링 상태
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
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
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeSubscriptionRef = useRef<any>(null);
  const qualityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 성능 측정을 위한 ref
  const requestStartTimeRef = useRef<number>(0);

  // 폴링 관련 상태
  const [lastPollingUpdate, setLastPollingUpdate] = useState<Date | null>(null);
  const [pollingErrorCount, setPollingErrorCount] = useState(0);

  // Supabase 클라이언트
  const supabase = createBrowserSupabaseClient();

  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';

  // 디바운싱된 검색어
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // 알림 시스템 함수들
  const addNotification = useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
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

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  // 연결 상태 변경 알림
  const notifyConnectionStateChange = useCallback((from: DataSourceMode, to: DataSourceMode) => {
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
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase]);

  // 연결 품질 업데이트
  const updateConnectionQuality = useCallback((success: boolean, responseTime?: number) => {
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
  const updateVoteDataPolling = useCallback(async () => {
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
  const updateVoteData = useCallback(async () => {
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
  const startPollingMode = useCallback(() => {
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
  const connectRealtime = useCallback(async () => {
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
  const stopPollingMode = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('⏹️ [Polling] Stopping polling mode');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 하이브리드 모드 시작
  const startHybridMode = useCallback(() => {
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
  const disconnectRealtime = useCallback(() => {
    if (realtimeSubscriptionRef.current) {
      realtimeSubscriptionRef.current.unsubscribe();
      realtimeSubscriptionRef.current = null;
      console.log('[Realtime] 연결 해제');
    }
  }, []);

  // 연결 모니터 정리
  const cleanupConnectionMonitor = useCallback(() => {
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
  const switchMode = useCallback((targetMode: DataSourceMode) => {
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
  useEffect(() => {
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
  useEffect(() => {
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
  useEffect(() => {
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
  const { rankedVoteItems, filteredItems, totalVotes } = useMemo(() => {
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
  const { voteTitle, voteContent } = useMemo(() => ({
    voteTitle: getLocalizedString(vote.title, currentLanguage),
    voteContent: getLocalizedString(vote.vote_content, currentLanguage),
  }), [vote.title, vote.vote_content, currentLanguage]);

  // 투표 확인 팝업 열기
  const handleCardClick = async (item: VoteItem) => {
    if (!canVote) return;

    await withAuth(() => {
      setVoteCandidate(item);
      setShowVoteModal(true);
    });
  };

  // 투표 실행
  const confirmVote = async () => {
    if (!voteCandidate || !canVote || isVoting) return;

    setIsVoting(true);
    
    try {
      await withAuth(async () => {
        // TODO: 실제 투표 API 호출
        console.log(`투표: ${voteCandidate.artist?.name}에게 ${voteAmount}표`);
        
        // 투표 성공 알림
        addNotification({
          type: 'success',
          title: '투표 완료',
          message: `${getLocalizedString(voteCandidate.artist?.name || '', currentLanguage)}에게 ${voteAmount}표 투표했습니다.`,
          duration: 3000,
        });
        
        setAvailableVotes(prev => Math.max(0, prev - voteAmount));
        setShowVoteModal(false);
        setVoteCandidate(null);
        setVoteAmount(1);
      });
    } catch (error) {
      console.error('투표 실패:', error);
      
      // 투표 실패 알림
      addNotification({
        type: 'error',
        title: '투표 실패',
        message: '투표 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
        duration: 4000,
      });
    } finally {
      setIsVoting(false);
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
  useEffect(() => {
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
  const startConnectionQualityMonitor = useCallback(() => {
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
  const attemptRealtimeReconnection = useCallback(() => {
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
          <Card className='border-0 bg-white/80 backdrop-blur-sm'>
            <Card.Header className='pb-2'>
              <div className='flex items-start justify-between gap-2 mb-1'>
                <h1 className='text-base md:text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex-1 min-w-0'>
                  {voteTitle}
                </h1>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      voteStatus === 'ongoing'
                        ? 'success'
                        : voteStatus === 'upcoming'
                        ? 'warning'
                        : 'default'
                    }
                    size="sm"
                  >
                    {voteStatus === 'ongoing' ? '진행 중' :
                     voteStatus === 'upcoming' ? '예정' : '종료'}
                  </Badge>
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
            </Card.Header>
          </Card>
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

      {/* 투표 아이템 목록 */}
      <div className="px-4 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item, index) => {
            return (
              <div
                key={item.id}
                className='transform transition-all duration-300 hover:scale-105 hover:-translate-y-2 cursor-pointer'
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
                onClick={() => handleCardClick(item)}
              >
                <VoteRankCard
                  item={{
                    ...item,
                    rank: item.rank,
                  }}
                  rank={item.rank}
                  className="h-full"
                  enableMotionAnimations={true}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 투표 확인 모달 */}
      {showVoteModal && voteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 m-4 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">투표 확인</h3>
            
            <div className="mb-4">
              <p className="text-gray-600 mb-2">
                {voteCandidate.artist?.name ? 
                  getLocalizedString(voteCandidate.artist.name, currentLanguage) :
                  '알 수 없는 아티스트'
                }에게 투표하시겠습니까?
              </p>
              
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">투표 수:</label>
                <input 
                  type="number"
                  min="1"
                  max={availableVotes}
                  value={voteAmount}
                  onChange={(e) => setVoteAmount(Math.min(availableVotes, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="border rounded px-2 py-1 w-20 text-center"
                />
              </div>
              
              <p className="text-xs text-gray-500">
                사용 가능한 투표: {availableVotes}표
              </p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={cancelVote}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={confirmVote}
                disabled={isVoting || voteAmount > availableVotes}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isVoting ? '투표 중...' : '투표하기'}
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