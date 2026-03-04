import React, { useMemo, useCallback, useRef, useState } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  NotificationState,
  ConnectionState,
  ConnectionQuality,
  ThresholdConfig,
  ERROR_RATE_PENALTY,
  CONSECUTIVE_ERROR_PENALTY,
  POLLING_LOG_THROTTLE_MS,
  DEFAULT_NOTIFICATION_DURATION_MS,
} from './vote-detail-types';

interface UseVotePollingParams {
  vote: Vote;
  voteId: number | string;
  initialItems: VoteItem[];
  pollingInterval: number;
  enableRealtime: boolean;
}

export function useVotePolling({
  vote,
  voteId,
  initialItems,
  pollingInterval,
  enableRealtime,
}: UseVotePollingParams) {
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

  // Highlight timers cleanup
  React.useEffect(() => {
    return () => {
      highlightTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      highlightTimersRef.current.clear();
    };
  }, []);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const addNotification = React.useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
    const newNotification: NotificationState = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setNotifications(prev => [...prev, newNotification]);
    const duration = notification.duration || DEFAULT_NOTIFICATION_DURATION_MS;
    setTimeout(() => {
      removeNotification(newNotification.id);
    }, duration);
  }, []);

  const removeNotification = React.useCallback((id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  // User fetching effect
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
      newScore -= newErrorRate * ERROR_RATE_PENALTY;
      newScore -= newConsecutiveErrors * CONSECUTIVE_ERROR_PENALTY;
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
        (!lastPollingUpdate || (Date.now() - lastPollingUpdate.getTime()) > POLLING_LOG_THROTTLE_MS);
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

  // Polling lifecycle effect
  React.useEffect(() => {
    startPollingMode();
    return () => {
      stopPollingMode();
    };
  }, []);

  // 연결 품질 모니터 제거됨

  // 재연결 시도 제거됨

  return {
    voteItems,
    setVoteItems,
    userVote,
    notifications,
    removeNotification,
    addNotification,
    connectionState,
    pollingStartTime,
    lastPollingUpdate,
    pollingErrorCount,
    updateVoteDataPolling,
    user,
    connectionQuality,
    recentlyUpdatedItemsRef,
  };
}
