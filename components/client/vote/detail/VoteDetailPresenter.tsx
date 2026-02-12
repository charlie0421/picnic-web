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
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';
import { useDebounce } from '@/hooks/useDebounce';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import VoteDialog from '../dialogs/VoteDialog';

interface NotificationState {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: Date;
}

type DataSourceMode = 'realtime' | 'polling' | 'static';

interface ConnectionState {
  mode: DataSourceMode;
  isConnected: boolean;
  lastUpdate: Date | null;
  errorCount: number;
  retryCount: number;
}

interface ConnectionQuality {
  score: number;
  latency: number;
  errorRate: number;
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

export interface VoteDetailPresenterProps {
  vote: Vote;
  initialItems: VoteItem[];
  rewards?: any[];
  className?: string;
  enableRealtime?: boolean;
  pollingInterval?: number;
  maxRetries?: number;
}

export function VoteDetailPresenter({
  vote,
  initialItems,
  rewards = [],
  className,
  enableRealtime = true,
  pollingInterval = 1000,
  maxRetries = 3,
}: VoteDetailPresenterProps) {
  const { currentLanguage } = useLanguageStore();
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });
  const ensureActiveMembership = useWithdrawalGuard();

  const [voteItems, setVoteItems] = React.useState<VoteItem[]>(() => {
    return initialItems
      .filter(item => !(item as any).deleted_at)
      .map(item => ({
      ...item,
      name: (item as any).artist?.name || 'Unknown',
      image_url: (item as any).artist?.image || '',
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

  const [user, setUser] = React.useState<any>(null);
  const [userVote, setUserVote] = React.useState<any>(null);
  const [notifications, setNotifications] = React.useState<NotificationState[]>([]);

  const [connectionState, setConnectionState] = React.useState<ConnectionState>({
    mode: 'polling',
    isConnected: false,
    lastUpdate: null,
    errorCount: 0,
    retryCount: 0,
  });

  const [pollingStartTime, setPollingStartTime] = React.useState<Date | null>(null);
  const [connectionQuality, setConnectionQuality] = React.useState<ConnectionQuality>({
    score: 100,
    latency: 0,
    errorRate: 0,
    consecutiveErrors: 0,
    consecutiveSuccesses: 0,
    lastConnectionTime: null,
    averageResponseTime: 0,
  });

  const thresholds: ThresholdConfig = {
    maxErrorCount: 3,
    maxConsecutiveErrors: 2,
    minConnectionQuality: 70,
    realtimeRetryDelay: 30000,
    pollingInterval: 1000,
    qualityCheckInterval: 15000,
  };

  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const initialDataNotifiedRef = React.useRef<boolean>(false);
  const requestStartTimeRef = React.useRef<number>(0);
  const [lastPollingUpdate, setLastPollingUpdate] = React.useState<Date | null>(null);
  const [pollingErrorCount, setPollingErrorCount] = React.useState(0);
  const recentlyUpdatedItemsRef = React.useRef<Set<string | number>>(new Set());
  const highlightTimersRef = React.useRef<Map<string | number, NodeJS.Timeout>>(new Map());

  React.useEffect(() => {
    return () => {
      highlightTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      highlightTimersRef.current.clear();
    };
  }, []);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const addNotification = React.useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
    const newNotification: NotificationState = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setNotifications(prev => [...prev, newNotification]);
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(newNotification.id);
    }, duration);
  }, []);

  const removeNotification = React.useCallback((id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  // 실시간 모드 제거됨

  React.useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase]);

  const updateConnectionQuality = React.useCallback((success: boolean, responseTime?: number) => {
    setConnectionQuality(prev => {
      const newConsecutiveErrors = success ? 0 : prev.consecutiveErrors + 1;
      const newConsecutiveSuccesses = success ? prev.consecutiveSuccesses + 1 : 0;
      const newErrorRate = success ? Math.max(0, prev.errorRate - 0.1) : Math.min(1, prev.errorRate + 0.2);
      let newScore = 100;
      newScore -= newErrorRate * 50;
      newScore -= newConsecutiveErrors * 15;
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

  const updateVoteDataPolling = React.useCallback(async () => {
    if (!vote?.id) return;
    // 실시간 모드 제거됨: 항상 폴링 수행
    const startTime = performance.now();
    requestStartTimeRef.current = startTime;
    try {
      const shouldLog = connectionState.mode === 'polling' && 
        (!lastPollingUpdate || (Date.now() - lastPollingUpdate.getTime()) > 5000);
      if (shouldLog) {
        console.log('[Polling] Fetching vote data...');
      }
      const response = await fetch(`/api/vote/${vote.id}/detail`, { cache: 'no-cache' });
      const responseTime = performance.now() - startTime;
      if (response.status === 304) {
        // 변경 없음: 정상 경로로 처리
        if (shouldLog) {
          console.log('[Polling] Not modified (304)');
        }
        updateConnectionQuality(true, responseTime);
        setConnectionState(prev => ({ ...prev, lastUpdate: new Date(), errorCount: 0 }));
        return;
      }
      if (!response.ok) {
        const voteError = await response.json().catch(() => ({}));
        console.error('[Polling] Vote fetch error:', voteError);
        setPollingErrorCount(prev => prev + 1);
        updateConnectionQuality(false, responseTime);
        addNotification({
          type: 'error',
          title: '데이터 로딩 오류',
          message: '투표 데이터를 가져오는 중 오류가 발생했습니다.',
          duration: 4000,
        });
        return;
      }
      const { vote: voteData } = await response.json();
      if (voteData) {
        if (shouldLog) {
          console.log('[Polling] Vote data received:', voteData);
        }
        const transformedVoteItems = (voteData.vote_item || [])
          .filter((item: any) => !item.deleted_at)
          .map((item: any) => ({
          id: item.id,
          artist_id: item.artist_id,
          group_id: item.group_id,
          vote_id: item.vote_id,
          vote_total: item.vote_total || 0,
          created_at: item.created_at,
          updated_at: item.updated_at,
          deleted_at: item.deleted_at,
          artist: item.artist ? {
            id: item.artist.id,
            name: item.artist.name,
            image: item.artist.image,
            ...item.artist
          } : null,
          name: item.artist?.name || 'Unknown',
          image_url: item.artist?.image || '',
          total_votes: item.vote_total || 0,
          rank: 0
        }));
        const sortedItems = transformedVoteItems
          .sort((a: any, b: any) => (b.total_votes || 0) - (a.total_votes || 0))
          .map((item: any, index: number) => ({
            ...item,
            rank: index + 1
          }));
        setVoteItems(sortedItems);
        setLastPollingUpdate(new Date());
        setPollingErrorCount(0);
        updateConnectionQuality(true, responseTime);
        setConnectionState(prev => ({
          ...prev,
          lastUpdate: new Date(),
          errorCount: 0,
        }));
        if (!initialDataNotifiedRef.current) {
          addNotification({
            type: 'success',
            title: '실시간 연결 성공',
            message: '투표 결과가 실시간으로 업데이트됩니다.',
            duration: 3000,
          });
          initialDataNotifiedRef.current = true;
        }
      }
      if (user) {
        type VotePickRow = {
          vote_item_id: number;
          amount: number | null;
          created_at: string;
        };

        const { data: userVoteData, error: userVoteError } = await supabase
          .from('vote_pick')
          .select('vote_item_id, amount, created_at')
          .eq('vote_id', vote.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .returns<VotePickRow[]>();
        if (userVoteError) {
          console.error('[Polling] User vote fetch error:', userVoteError);
          updateConnectionQuality(false);
        } else if (userVoteData && userVoteData.length > 0) {
          if (userVoteData.length > 1 && shouldLog) {
            console.log(`[Polling] 사용자가 ${userVoteData.length}번 투표함:`, userVoteData);
            const voteSummary = {
              totalVotes: userVoteData.reduce((sum, vote) => sum + (vote.amount || 0), 0),
              voteCount: userVoteData.length,
              lastVoteItem: userVoteData[0].vote_item_id,
              allVoteItems: Array.from(new Set(userVoteData.map(v => v.vote_item_id))),
              votes: userVoteData
            };
            setUserVote(voteSummary);
          } else {
            setUserVote({
              totalVotes: userVoteData[0].amount || 0,
              voteCount: 1,
              lastVoteItem: userVoteData[0].vote_item_id,
              allVoteItems: [userVoteData[0].vote_item_id],
              votes: userVoteData
            });
          }
        } else {
          setUserVote(null);
        }
      }
    } catch (error) {
      const responseTime = performance.now() - startTime;
      console.error('[Polling] Unexpected error:', error);
      setPollingErrorCount(prev => prev + 1);
      updateConnectionQuality(false, responseTime);
      setConnectionState(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1,
      }));
    }
  }, [vote?.id, user, supabase, updateConnectionQuality, connectionState.mode, lastPollingUpdate]);

  // 실시간 구독 제거됨

  const stopPollingMode = React.useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // 폴링 시작
  const startPollingMode = React.useCallback(() => {
    // 기존 인터벌 정리
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // 상태 갱신 및 즉시 한 번 데이터 가져오기
    setConnectionState(prev => ({
      ...prev,
      mode: 'polling',
      isConnected: true,
    }));
    setPollingStartTime(new Date());
    updateVoteDataPolling();

    // 주기적 폴링 시작 (기본 1초)
    const intervalMs = Math.max(1000, Number(pollingInterval) || 1000);
    const interval = setInterval(() => {
      updateVoteDataPolling();
    }, intervalMs);
    // 브라우저/노드 타입 차이를 피하기 위해 캐스팅
    pollingIntervalRef.current = interval as unknown as NodeJS.Timeout;
  }, [pollingInterval, updateVoteDataPolling]);

  // 하이브리드 모드 제거됨

  // 실시간 구독 해제 로직 제거됨

  // 연결 모니터 제거됨

  // 모드 전환 제거됨 (항상 폴링)

  React.useEffect(() => {
    startPollingMode();
    return () => {
      stopPollingMode();
    };
  }, []);

  // 연결 품질 모니터 제거됨

  // 재연결 시도 제거됨

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
      observer.observe(headerRef.current, { childList: true, subtree: true, attributes: true });
    }
    const timer = setTimeout(updateHeaderHeight, 100);
    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const handleCardClick = async (item: VoteItem) => {
    if (!canVote) return;
    if (await ensureActiveMembership()) {
      return;
    }
    const result = await withAuth(async () => {
      setVoteCandidate(item);
      setVoteAmount(1);
      setShowVoteModal(true);
      return true;
    });
    if (!result) {
      return;
    }
  };

  const confirmVote = async () => {
    if (!voteCandidate || voteAmount <= 0 || voteAmount > availableVotes) return;
    if (await ensureActiveMembership()) {
      return;
    }
    const result = await withAuth(async () => {
      setIsVoting(true);
      setShowVoteModal(false);
      try {
        setVoteItems((prev) => prev.map((item) => item.id === voteCandidate.id ? { ...item, vote_total: (item.vote_total || 0) + voteAmount } : item));
        setAvailableVotes((prev) => prev - voteAmount);
        addNotification({ type: 'success', title: '투표 완료', message: `${getLocalizedString(((voteCandidate as any)?.artist?.name) || '', currentLanguage)}에게 ${voteAmount}표 투표했습니다.`, duration: 3000 });
      } catch (error) {
        addNotification({ type: 'error', title: '투표 실패', message: '투표 처리 중 오류가 발생했습니다. 다시 시도해주세요.', duration: 4000 });
      } finally {
        setIsVoting(false);
        setVoteCandidate(null);
        setVoteAmount(1);
      }
      return true;
    });
    if (!result) {
      return;
    }
  };

  const cancelVote = () => {
    setShowVoteModal(false);
    setVoteCandidate(null);
    setVoteAmount(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const { rankedVoteItems, filteredItems, totalVotes } = React.useMemo(() => {
    const ranked = [...voteItems]
      .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        _realtimeInfo: { isHighlighted: recentlyUpdatedItemsRef.current.has(item.id), isUpdated: recentlyUpdatedItemsRef.current.has(item.id), rankChange: 'same' as const },
      }));
    const filtered = debouncedSearchQuery
      ? ranked.filter(item => {
          const artistName = (item as any).artist?.name ? getLocalizedString((item as any).artist.name, currentLanguage)?.toLowerCase() || '' : '';
          const query = debouncedSearchQuery.toLowerCase();
          return artistName.includes(query);
        })
      : ranked;
    const total = voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0);
    return { rankedVoteItems: ranked, filteredItems: filtered, totalVotes: total };
  }, [voteItems, debouncedSearchQuery, currentLanguage]);

  const formatVotePeriod = () => {
    if (!vote.start_at || !vote.stop_at) return '';
    const startDate = new Date(vote.start_at);
    const endDate = new Date(vote.stop_at);
    const formatDate = (date: Date) => date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
  };

  const renderTimer = () => {
    if (voteStatus !== 'ongoing' || !timeLeft) return null;
    const { days, hours, minutes, seconds } = timeLeft;
    const isExpired = days === 0 && hours === 0 && minutes === 0 && seconds === 0;
    if (isExpired) {
      return (
        <div className='flex items-center gap-2'>
          <span className='text-xl'>🚫</span>
          <span className='text-sm md:text-base font-bold text-red-600'>마감</span>
        </div>
      );
    }
    return (
      <div className='flex items-center gap-2'>
        <span className='text-xl'>⏱️</span>
        <div className='flex items-center gap-1 text-xs sm:text-sm font-mono font-bold'>
          {days > 0 && (<><span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>{days}일</span><span className='text-gray-400'>:</span></>)}
          <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>{hours}시</span>
          <span className='text-gray-400'>:</span>
          <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>{minutes}분</span>
          <span className='text-gray-400'>:</span>
          <span className='bg-red-100 text-red-800 px-1.5 py-0.5 rounded animate-pulse text-xs'>{seconds}초</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 ${className}`}>
      <div ref={headerRef} className='sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-lg mb-2'>
        <div className='relative overflow-hidden'>
          <div className='absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-10'></div>
          <div className='border-0 bg-white/80 backdrop-blur-sm rounded-lg p-4'>
            <div className='pb-2'>
              <div className='flex items-start justify-between gap-2 mb-1'>
                <h1 className='text-base md:text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex-1 min-w-0'>{getLocalizedString(vote.title, currentLanguage)}</h1>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${voteStatus === 'ongoing' ? 'bg-green-100 text-green-800' : voteStatus === 'upcoming' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                    {voteStatus === 'ongoing' ? '진행 중' : voteStatus === 'upcoming' ? '예정' : '종료'}
                  </span>
                </div>
              </div>
              <div className='flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600 mb-2'>
                <span>📅 {formatVotePeriod()}</span>
                <span className="hidden sm:inline">•</span>
                <span>👥 총 {voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0).toLocaleString()} 표</span>
              </div>
              <div className="flex items-center justify-between">
                {renderTimer()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <VoteSearch onSearch={handleSearch} placeholder={`${rankedVoteItems.length}명 중 검색...`} totalItems={rankedVoteItems.length} searchResults={filteredItems} disabled={!canVote} />
      </div>

      {voteStatus !== 'upcoming' && rankedVoteItems.length > 0 && (
        <div className='sticky z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 py-2 md:py-3 mb-2 md:mb-4 shadow-lg' style={{ top: `${headerHeight}px` }}>
          <div className='container mx-auto px-4'>
            <div className='text-center mb-2 md:mb-3'>
              <div className='flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4'>
                <h2 className='text-lg md:text-xl font-bold bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-500 bg-clip-text text-transparent'>🏆 TOP 3</h2>
                <div className='flex items-center gap-3'>{renderTimer()}</div>
              </div>
            </div>
            <div className='flex justify-center items-end w-full max-w-4xl gap-1 sm:gap-2 md:gap-4 px-2 sm:px-4 mx-auto'>
              {rankedVoteItems[1] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                      <VoteRankCard item={rankedVoteItems[1]} rank={2} className='w-20 sm:w-24 md:w-28 lg:w-32' voteTotal={rankedVoteItems[1].vote_total || 0} enableMotionAnimations={true} />
                    </div>
                  </div>
                  <div className='mt-1 text-center'><div className='text-sm'>🥈</div></div>
                </div>
              )}
              {rankedVoteItems[0] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10'>
                  <div className='relative'>
                    <div className='absolute -inset-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                    <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                      <div className='absolute -top-0.5 -right-0.5 text-sm animate-bounce'>👑</div>
                      <VoteRankCard item={rankedVoteItems[0]} rank={1} className='w-24 sm:w-32 md:w-36 lg:w-40' voteTotal={rankedVoteItems[0].vote_total || 0} enableMotionAnimations={true} />
                    </div>
                  </div>
                  <div className='mt-1 text-center'><div className='text-base font-bold animate-pulse'>🥇</div></div>
                </div>
              )}
              {rankedVoteItems[2] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                      <VoteRankCard item={rankedVoteItems[2]} rank={3} className='w-18 sm:w-20 md:w-24 lg:w-28' voteTotal={rankedVoteItems[2].vote_total || 0} enableMotionAnimations={true} />
                    </div>
                  </div>
                  <div className='mt-1 text-center'><div className='text-sm'>🥉</div></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className='container mx-auto px-4 pb-8'>
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3 md:gap-4'>
          {filteredItems.map((item, index) => {
            const artistName = (item as any).artist?.name ? getLocalizedString((item as any).artist.name, currentLanguage) || '아티스트' : '아티스트';
            const imageSrc = (item as any).artist?.image || null;
            return (
              <div key={item.id} className='transform transition-all duration-300 hover:scale-105 hover:-translate-y-2' style={{ animationDelay: `${index * 50}ms` }} onClick={() => { if (canVote) { handleCardClick(item); } }}>
                <Card hoverable={canVote} className={`
                    group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl 
                    transition-all duration-300 cursor-pointer
                    ${!canVote ? 'opacity-75 grayscale cursor-not-allowed' : 'hover:shadow-blue-200/50 hover:shadow-xl'}
                    ${item.rank && item.rank <= 3 ? 'ring-2 ring-yellow-400/50 bg-gradient-to-br from-yellow-50/50 to-orange-50/50' : 'bg-gradient-to-br from-white to-blue-50/30'}
                    backdrop-blur-sm
                  `}>
                  {item.rank && item.rank <= 10 && (
                    <div className={`
                      absolute top-1 left-1 z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-full 
                      flex items-center justify-center text-xs font-bold text-white shadow-lg
                      ${item.rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 animate-pulse' : item.rank === 2 ? 'bg-gradient-to-br from-gray-400 to-gray-600' : item.rank === 3 ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-purple-600'}
                    `}>
                      {item.rank}
                    </div>
                  )}
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
                          <OptimizedImage
                            src={imageSrc || '/images/default-artist.png'}
                            alt={artistName}
                            fill
                            className='object-cover transition-all duration-300 group-hover:scale-105 group-hover:brightness-110'
                            fallbackSrc='/images/default-artist.png'
                          />
                          <div className='absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
                        </div>
                      </div>
                      <h3 className='font-bold text-xs mb-0.5 line-clamp-1 group-hover:text-blue-600 transition-colors text-gray-900'>{artistName}</h3>
                      {(item as any).artist?.artistGroup?.name && (
                        <p className='text-xs text-gray-500 mb-0.5 line-clamp-1 group-hover:text-gray-700 transition-colors'>
                          {getLocalizedString((item as any).artist.artistGroup.name, currentLanguage)}
                        </p>
                      )}
                      <div className='space-y-0.5'>
                        <p className='text-xs sm:text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent'>
                          {(item.vote_total || 0).toLocaleString()}<span className='text-xs text-gray-500 ml-0.5'> 표</span>
                        </p>
                        {item.rank && (
                          <div className='flex items-center justify-center gap-0.5'>
                            {item.rank <= 3 && (<span className='text-xs'>{item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉'}</span>)}
                            <span className='text-xs text-gray-500 font-medium'>{item.rank}위</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card.Body>
                  <div className={`
                    absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    ${item.rank && item.rank <= 3 ? 'from-yellow-400 via-orange-500 to-red-500' : 'from-blue-500 via-purple-500 to-pink-500'}
                  `}></div>
                </Card>
              </div>
            );
          })}
        </div>
        {filteredItems.length === 0 && (
          <div className='text-center py-8'>
            <p className='text-gray-500'>검색 결과가 없습니다.</p>
          </div>
        )}
      </div>

      {showVoteModal && (
        <VoteDialog isOpen={showVoteModal} onClose={cancelVote} voteId={vote.id} voteItemId={voteCandidate?.id || 0} artistName={(voteCandidate as any)?.artist?.name ? getLocalizedString((voteCandidate as any).artist.name, currentLanguage) || '' : ''} onVoteSuccess={(amount: number) => {}} />
      )}

      <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
        {notifications.map((notification) => (
          <div key={notification.id} className={`
              p-4 rounded-lg shadow-lg border-l-4 bg-white transform transition-all duration-300 ease-in-out
              ${notification.type === 'success' ? 'border-green-500 bg-green-50' : ''}
              ${notification.type === 'error' ? 'border-red-500 bg-red-50' : ''}
              ${notification.type === 'warning' ? 'border-yellow-500 bg-yellow-50' : ''}
              ${notification.type === 'info' ? 'border-blue-500 bg-blue-50' : ''}
            `}>
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
              <button onClick={() => removeNotification(notification.id)} className={`
                  text-xs hover:opacity-70 transition-opacity
                  ${notification.type === 'success' ? 'text-green-800' : ''}
                  ${notification.type === 'error' ? 'text-red-800' : ''}
                  ${notification.type === 'warning' ? 'text-yellow-800' : ''}
                  ${notification.type === 'info' ? 'text-blue-800' : ''}
                `}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

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

      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-xs max-w-sm space-y-3">
          <h4 className="font-semibold mb-2 text-yellow-300">🔧 폴링 디버거</h4>
          <div className="space-y-1 mb-3">
            <p className="text-green-300">📊 폴링 상태:</p>
            <p>• 마지막 업데이트: <span className="text-blue-300">{lastPollingUpdate?.toLocaleTimeString() || 'None'}</span></p>
            {pollingStartTime && (<p>• 폴링 지속시간: <span className="text-purple-300">{Math.floor((Date.now() - pollingStartTime.getTime()) / 1000)}초</span></p>)}
            <p>• 폴링 에러 수: <span className="text-red-300">{pollingErrorCount}</span></p>
          </div>
          <div className="space-y-1 mb-3">
            <p className="text-green-300">📋 데이터:</p>
            <p>• 총 아이템: <span className="text-cyan-300">{voteItems.length}</span></p>
            <p>• 필터된 아이템: <span className="text-cyan-300">{filteredItems.length}</span></p>
            <p>• 검색어: <span className="text-yellow-300">&quot;{searchQuery}&quot;</span></p>
            {user && (<p>• 사용자: <span className="text-green-300">로그인됨</span></p>)}
          </div>
          <div className="space-y-2">
            <p className="text-green-300">🎛️ 수동 제어:</p>
            <div className="flex gap-1">
              <button onClick={() => updateVoteDataPolling()} className="px-2 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-mono">수동 새로고침</button>
              <button onClick={() => { console.clear(); }} className="px-2 py-1 text-xs rounded bg-orange-600 hover:bg-orange-500 text-white font-mono">콘솔 클리어</button>
            </div>
          </div>
          <div className="border-t border-gray-600 pt-2 text-xs">
            <p className="text-green-300">📝 폴링 로그:</p>
            <p className="text-gray-300 font-mono text-xs">Last update: {lastPollingUpdate?.toLocaleTimeString() || 'N/A'}</p>
            <p className="text-yellow-300 font-mono text-xs">⚡ {pollingErrorCount === 0 ? '안정적 폴링' : `에러 ${pollingErrorCount}회`}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default VoteDetailPresenter;


