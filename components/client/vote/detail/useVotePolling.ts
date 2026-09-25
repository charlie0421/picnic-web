import React, { useMemo } from 'react';
import { VoteItem } from '@/types/interfaces';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  NotificationState,
  POLLING_LOG_THROTTLE_MS,
  DEFAULT_NOTIFICATION_DURATION_MS,
} from './vote-detail-types';
import {
  UseVotePollingParams,
  DEFAULT_THRESHOLDS,
  createInitialConnectionState,
  createInitialConnectionQuality,
  computeConnectionQuality,
  transformVoteItems,
  VotePickRow,
  buildUserVoteSummary,
} from './vote-polling-data';

export function useVotePolling({
  vote,
  voteId,
  initialItems,
  pollingInterval,
  enableRealtime,
}: UseVotePollingParams) {
  const [voteItems, setVoteItems] = React.useState<VoteItem[]>(() => transformVoteItems(initialItems));

  const [user, setUser] = React.useState<any>(null);
  const [userVote, setUserVote] = React.useState<any>(null);
  const [notifications, setNotifications] = React.useState<NotificationState[]>([]);

  const [connectionState, setConnectionState] = React.useState(createInitialConnectionState);

  const [pollingStartTime, setPollingStartTime] = React.useState<Date | null>(null);
  const [connectionQuality, setConnectionQuality] = React.useState(createInitialConnectionQuality);

  const thresholds = DEFAULT_THRESHOLDS;

  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const initialDataNotifiedRef = React.useRef<boolean>(false);
  const hadPollingErrorRef = React.useRef<boolean>(false);
  const consecutivePollingErrorsRef = React.useRef<number>(0);
  const requestStartTimeRef = React.useRef<number>(0);
  const [lastPollingUpdate, setLastPollingUpdate] = React.useState<Date | null>(null);
  const lastPollingUpdateRef = React.useRef<Date | null>(null);
  const [pollingErrorCount, setPollingErrorCount] = React.useState(0);
  const recentlyUpdatedItemsRef = React.useRef<Set<string | number>>(new Set());
  const highlightTimersRef = React.useRef<Map<string | number, NodeJS.Timeout>>(new Map());
  // unmount 후 in-flight fetch / 비동기 콜백의 setState 가 deleted fiber 에 닿아
  // React reconciler 가 removeChild on null 을 일으키는 race condition (PICNIC-WEB-5N)
  // 을 차단. 모든 비동기 후 setState 호출 직전에 가드한다.
  const isMountedRef = React.useRef(true);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const notificationTimersRef = React.useRef<Set<NodeJS.Timeout>>(new Set());

  // Highlight timers cleanup
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // in-flight fetch 취소
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      // notification auto-dismiss 타이머 정리
      notificationTimersRef.current.forEach((t) => clearTimeout(t));
      notificationTimersRef.current.clear();
      // highlight 타이머 정리
      highlightTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      highlightTimersRef.current.clear();
    };
  }, []);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const addNotification = React.useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
    if (!isMountedRef.current) return;
    const newNotification: NotificationState = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setNotifications(prev => [...prev, newNotification]);
    const duration = notification.duration || DEFAULT_NOTIFICATION_DURATION_MS;
    const timer = setTimeout(() => {
      notificationTimersRef.current.delete(timer);
      if (!isMountedRef.current) return;
      removeNotification(newNotification.id);
    }, duration);
    notificationTimersRef.current.add(timer);
  }, []);

  const removeNotification = React.useCallback((id: string) => {
    if (!isMountedRef.current) return;
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  }, []);

  // User fetching effect
  React.useEffect(() => {
    let cancelled = false;
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !isMountedRef.current) return;
      setUser(user);
    };
    getUser();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const updateConnectionQuality = React.useCallback((success: boolean, responseTime?: number) => {
    setConnectionQuality(prev => computeConnectionQuality(prev, success, responseTime));
  }, []);

  const markPollingSuccess = React.useCallback((responseTime: number) => {
    consecutivePollingErrorsRef.current = 0;
    setPollingErrorCount(0);
    updateConnectionQuality(true, responseTime);
    setConnectionState(prev => ({
      ...prev,
      lastUpdate: new Date(),
      errorCount: 0,
    }));

    if (!initialDataNotifiedRef.current || hadPollingErrorRef.current) {
      addNotification({
        type: 'success',
        title: '실시간 연결 성공',
        message: '투표 결과가 실시간으로 업데이트됩니다.',
        duration: 3000,
      });
      initialDataNotifiedRef.current = true;
    }
    hadPollingErrorRef.current = false;
  }, [addNotification, updateConnectionQuality]);

  const markPollingFailure = React.useCallback((responseTime?: number) => {
    const nextErrorCount = consecutivePollingErrorsRef.current + 1;
    consecutivePollingErrorsRef.current = nextErrorCount;
    hadPollingErrorRef.current = true;
    setPollingErrorCount(nextErrorCount);
    updateConnectionQuality(false, responseTime);
    setConnectionState(prev => ({
      ...prev,
      errorCount: nextErrorCount,
    }));
  }, [updateConnectionQuality]);

  const updateVoteDataPolling = React.useCallback(async () => {
    if (!vote?.id) return;
    if (!isMountedRef.current) return;
    // 직전 in-flight fetch 가 있으면 abort 한다 (race + double setState 방지).
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 실시간 모드 제거됨: 항상 폴링 수행
    const startTime = performance.now();
    requestStartTimeRef.current = startTime;
    try {
      const shouldLog = !lastPollingUpdateRef.current ||
        (Date.now() - lastPollingUpdateRef.current.getTime()) > POLLING_LOG_THROTTLE_MS;
      if (shouldLog) {
        console.log('[Polling] Fetching vote data...');
      }
      const response = await fetch(`/api/vote/${vote.id}/detail`, {
        cache: 'no-cache',
        signal: controller.signal,
      });
      const responseTime = performance.now() - startTime;
      if (!isMountedRef.current) return;
      if (response.status === 304) {
        // 변경 없음: 정상 경로로 처리
        if (shouldLog) {
          console.log('[Polling] Not modified (304)');
        }
        markPollingSuccess(responseTime);
        return;
      }
      if (!response.ok) {
        const voteError = await response.json().catch(() => ({}));
        if (!isMountedRef.current) return;
        console.error('[Polling] Vote fetch error:', voteError);
        markPollingFailure(responseTime);
        addNotification({
          type: 'error',
          title: '데이터 로딩 오류',
          message: '투표 데이터를 가져오는 중 오류가 발생했습니다.',
          duration: 4000,
        });
        return;
      }
      const { vote: voteData } = await response.json();
      if (!isMountedRef.current) return;
      if (voteData) {
        if (shouldLog) {
          console.log('[Polling] Vote data received:', voteData);
        }
        setVoteItems(transformVoteItems(voteData.vote_item || []));
        const updatedAt = new Date();
        lastPollingUpdateRef.current = updatedAt;
        setLastPollingUpdate(updatedAt);
        markPollingSuccess(responseTime);
      }
      if (user) {
        const { data: userVoteData, error: userVoteError } = await supabase
          .from('vote_pick')
          .select('vote_item_id, amount, created_at')
          .eq('vote_id', vote.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .returns<VotePickRow[]>();
        if (!isMountedRef.current) return;
        if (userVoteError) {
          console.error('[Polling] User vote fetch error:', userVoteError);
          updateConnectionQuality(false);
        } else {
          setUserVote(buildUserVoteSummary(userVoteData || [], shouldLog));
        }
      }
    } catch (error) {
      // AbortError 는 정상 cleanup 흐름이라 noise 로 처리하지 않는다.
      if ((error as { name?: string } | null)?.name === 'AbortError') return;
      if (!isMountedRef.current) return;
      const responseTime = performance.now() - startTime;
      console.error('[Polling] Unexpected error:', error);
      markPollingFailure(responseTime);
    }
  }, [vote?.id, user, supabase, markPollingFailure, markPollingSuccess, addNotification]);

  // 실시간 구독 제거됨

  // Polling lifecycle effect
  React.useEffect(() => {
    let cancelled = false;
    const baseIntervalMs = Math.max(1000, Number(pollingInterval) || 5000);

    const hasVoteEnded = () => {
      if (!vote?.stop_at) return false;
      const stopAt = Date.parse(vote.stop_at);
      return Number.isFinite(stopAt) && stopAt <= Date.now();
    };

    const shouldPause = () => document.hidden || hasVoteEnded();

    const clearPollingTimer = () => {
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      clearPollingTimer();
      if (cancelled || shouldPause()) return;

      const backoffMultiplier = 2 ** Math.min(consecutivePollingErrorsRef.current, 4);
      const delayMs = Math.min(baseIntervalMs * backoffMultiplier, 60_000);
      pollingIntervalRef.current = setTimeout(async () => {
        pollingIntervalRef.current = null;
        if (cancelled || shouldPause()) return;
        await updateVoteDataPolling();
        if (!cancelled) scheduleNextPoll();
      }, delayMs) as unknown as NodeJS.Timeout;
    };

    const startPolling = async () => {
      clearPollingTimer();
      if (cancelled || shouldPause()) return;

      setConnectionState(prev => ({
        ...prev,
        mode: 'polling',
        isConnected: true,
      }));
      setPollingStartTime(new Date());
      await updateVoteDataPolling();
      if (!cancelled) scheduleNextPoll();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearPollingTimer();
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        return;
      }
      void startPolling();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void startPolling();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPollingTimer();
      // 진행 중인 fetch 도 즉시 취소 (interval 외)
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [pollingInterval, updateVoteDataPolling, vote?.stop_at]);

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
