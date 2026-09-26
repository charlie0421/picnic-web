import React, { useMemo } from 'react';
import { VoteItem } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  NotificationState,
  POLLING_LOG_THROTTLE_MS,
  DEFAULT_NOTIFICATION_DURATION_MS,
} from './vote-detail-types';
import {
  UseVotePollingParams,
  DEFAULT_THRESHOLDS,
  DEFAULT_VOTE_POLLING_INTERVAL_MS,
  getBrowserSafeTimerDelayMs,
  getVotePollingDelayMs,
  createInitialConnectionState,
  createInitialConnectionQuality,
  computeConnectionQuality,
  transformVoteItems,
  VotePickRow,
  buildUserVoteSummary,
} from './vote-polling-data';

const POLL_REQUEST_TIMEOUT_MS = 10_000;
const FINAL_POLL_GRACE_MS = 8_000;
const FINAL_POLL_JITTER_MAX_MS = 5_000;
const FINAL_REFRESH_MAX_RETRIES = 2;
const FINAL_REFRESH_RETRY_BASE_MS = 1_000;

type PollRequestOptions = {
  useSharedCache?: boolean;
};

type PollRequestResult = 'success' | 'failed' | 'aborted';

const parseStopAt = (stopAt: string | null | undefined) => {
  if (!stopAt) return null;
  const parsed = Date.parse(stopAt);
  return Number.isFinite(parsed) ? parsed : null;
};

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
  const [hasReachedVoteDeadline, setHasReachedVoteDeadline] = React.useState(() => {
    const stopAt = parseStopAt(vote?.stop_at);
    return stopAt !== null && stopAt <= Date.now();
  });
  const recentlyUpdatedItemsRef = React.useRef<Set<string | number>>(new Set());
  const highlightTimersRef = React.useRef<Map<string | number, NodeJS.Timeout>>(new Map());
  // unmount 후 in-flight fetch / 비동기 콜백의 setState 가 deleted fiber 에 닿아
  // React reconciler 가 removeChild on null 을 일으키는 race condition (PICNIC-WEB-5N)
  // 을 차단. 모든 비동기 후 setState 호출 직전에 가드한다.
  const isMountedRef = React.useRef(true);
  const userRef = React.useRef<any>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const deadlineTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const finalRefreshTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const finalRefreshKeyRef = React.useRef<string | null>(null);
  const finalRefreshDoneRef = React.useRef(false);
  const finalRefreshSkippedRef = React.useRef(false);
  const finalRefreshDueAtRef = React.useRef<number | null>(null);
  const finalRefreshFailureCountRef = React.useRef(0);
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
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (cancelled || !isMountedRef.current) return;
      userRef.current = currentUser;
      setUser(currentUser);
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
        title: useLanguageStore.getState().t('vote_realtime_connected_title'),
        message: useLanguageStore.getState().t('vote_realtime_connected_message'),
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

  const updateVoteDataPolling = React.useCallback(async ({
    useSharedCache = false,
  }: PollRequestOptions = {}): Promise<PollRequestResult> => {
    if (!vote?.id) return 'failed';
    if (!isMountedRef.current) return 'aborted';
    // 직전 in-flight fetch 가 있으면 abort 한다 (race + double setState 방지).
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let didTimeout = false;
    const timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, POLL_REQUEST_TIMEOUT_MS);

    // 실시간 모드 제거됨: 항상 폴링 수행
    const startTime = performance.now();
    requestStartTimeRef.current = startTime;
    try {
      const shouldLog = !lastPollingUpdateRef.current ||
        (Date.now() - lastPollingUpdateRef.current.getTime()) > POLLING_LOG_THROTTLE_MS;
      if (shouldLog) {
        console.log('[Polling] Fetching vote data...');
      }
      const requestInit: RequestInit = {
        signal: controller.signal,
      };
      if (!useSharedCache) {
        requestInit.cache = 'no-cache';
      }
      const response = await fetch(`/api/vote/${vote.id}/detail`, requestInit);
      const responseTime = performance.now() - startTime;
      if (!isMountedRef.current) return 'aborted';
      if (response.status === 304) {
        // 변경 없음: 정상 경로로 처리
        if (shouldLog) {
          console.log('[Polling] Not modified (304)');
        }
        markPollingSuccess(responseTime);
        return 'success';
      }
      if (!response.ok) {
        const voteError = await response.json().catch(() => ({}));
        if (!isMountedRef.current) return 'aborted';
        console.error('[Polling] Vote fetch error:', voteError);
        markPollingFailure(responseTime);
        addNotification({
          type: 'error',
          title: useLanguageStore.getState().t('vote_data_load_error_title'),
          message: useLanguageStore.getState().t('vote_data_load_error_message'),
          duration: 4000,
        });
        return 'failed';
      }
      const { vote: voteData } = await response.json();
      if (!isMountedRef.current) return 'aborted';
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
      const currentUser = userRef.current;
      if (currentUser) {
        const { data: userVoteData, error: userVoteError } = await supabase
          .from('vote_pick')
          .select('vote_item_id, amount, created_at')
          .eq('vote_id', vote.id)
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal)
          .returns<VotePickRow[]>();
        if (!isMountedRef.current) return 'aborted';
        if (userVoteError) {
          console.error('[Polling] User vote fetch error:', userVoteError);
          updateConnectionQuality(false);
        } else {
          setUserVote(buildUserVoteSummary(userVoteData || [], shouldLog));
        }
      }
      return 'success';
    } catch (error) {
      const isAbortError = (error as { name?: string } | null)?.name === 'AbortError';
      // visibility 전환·언마운트·새 요청에 의한 취소는 정상 cleanup 흐름이다.
      if (isAbortError && !didTimeout) return 'aborted';
      if (!isMountedRef.current) return 'aborted';
      const responseTime = performance.now() - startTime;
      if (didTimeout) {
        console.warn('[Polling] Request timed out after 10 seconds');
      } else {
        console.error('[Polling] Unexpected error:', error);
      }
      markPollingFailure(responseTime);
      return 'failed';
    } finally {
      clearTimeout(timeout);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [vote?.id, supabase, markPollingFailure, markPollingSuccess, addNotification]);

  // 실시간 구독 제거됨

  // Polling lifecycle effect
  React.useEffect(() => {
    let cancelled = false;
    const baseIntervalMs = Math.max(
      1000,
      Number(pollingInterval) || DEFAULT_VOTE_POLLING_INTERVAL_MS,
    );
    const stopAt = parseStopAt(vote?.stop_at);
    const finalRefreshKey = `${vote?.id ?? voteId}:${vote?.stop_at ?? ''}`;
    if (finalRefreshKeyRef.current !== finalRefreshKey) {
      finalRefreshKeyRef.current = finalRefreshKey;
      finalRefreshDoneRef.current = false;
      finalRefreshFailureCountRef.current = 0;

      const graceDeadline = stopAt === null
        ? null
        : stopAt + FINAL_POLL_GRACE_MS;
      finalRefreshSkippedRef.current = graceDeadline !== null && Date.now() > graceDeadline;
      finalRefreshDueAtRef.current = graceDeadline === null || finalRefreshSkippedRef.current
        ? null
        : graceDeadline + Math.floor(Math.random() * (FINAL_POLL_JITTER_MAX_MS + 1));
    }

    const clearPollingTimer = () => {
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    const clearDeadlineTimer = () => {
      if (deadlineTimerRef.current) {
        clearTimeout(deadlineTimerRef.current);
        deadlineTimerRef.current = null;
      }
    };

    const clearFinalRefreshTimer = () => {
      if (finalRefreshTimerRef.current) {
        clearTimeout(finalRefreshTimerRef.current);
        finalRefreshTimerRef.current = null;
      }
    };

    async function runFinalRefresh() {
      if (
        cancelled ||
        document.hidden ||
        finalRefreshDoneRef.current ||
        finalRefreshSkippedRef.current ||
        finalRefreshFailureCountRef.current > FINAL_REFRESH_MAX_RETRIES
      ) {
        return;
      }

      clearPollingTimer();
      clearDeadlineTimer();
      clearFinalRefreshTimer();
      const result = await updateVoteDataPolling({ useSharedCache: true });
      if (cancelled) return;

      if (result === 'success') {
        finalRefreshDoneRef.current = true;
        finalRefreshFailureCountRef.current = 0;
        return;
      }

      if (result === 'aborted') {
        if (!document.hidden) scheduleFinalRefresh(0);
        return;
      }

      finalRefreshFailureCountRef.current += 1;
      if (finalRefreshFailureCountRef.current <= FINAL_REFRESH_MAX_RETRIES) {
        const retryDelayMs = FINAL_REFRESH_RETRY_BASE_MS
          * (2 ** (finalRefreshFailureCountRef.current - 1));
        scheduleFinalRefresh(retryDelayMs);
      }
    }

    function scheduleFinalRefresh(delayOverrideMs?: number) {
      clearFinalRefreshTimer();
      if (
        cancelled ||
        stopAt === null ||
        finalRefreshDoneRef.current ||
        finalRefreshSkippedRef.current ||
        finalRefreshFailureCountRef.current > FINAL_REFRESH_MAX_RETRIES ||
        document.hidden
      ) {
        return;
      }

      const delayMs = delayOverrideMs ?? Math.max(
        0,
        (finalRefreshDueAtRef.current ?? stopAt + FINAL_POLL_GRACE_MS) - Date.now(),
      );
      finalRefreshTimerRef.current = setTimeout(() => {
        finalRefreshTimerRef.current = null;
        void runFinalRefresh();
      }, delayMs) as unknown as NodeJS.Timeout;
    }

    function markDeadlineReached() {
      if (cancelled) return;
      setHasReachedVoteDeadline(true);
      clearPollingTimer();
      clearDeadlineTimer();
      scheduleFinalRefresh();
    }

    function scheduleDeadline() {
      clearDeadlineTimer();
      if (cancelled || stopAt === null || document.hidden) return;

      const remainingMs = stopAt - Date.now();
      if (remainingMs <= 0) {
        markDeadlineReached();
        return;
      }

      deadlineTimerRef.current = setTimeout(() => {
        deadlineTimerRef.current = null;
        if (stopAt > Date.now()) {
          scheduleDeadline();
          return;
        }
        markDeadlineReached();
      }, getBrowserSafeTimerDelayMs(remainingMs)) as unknown as NodeJS.Timeout;
    }

    const scheduleNextPoll = () => {
      clearPollingTimer();
      if (cancelled || document.hidden) return;
      if (stopAt !== null && stopAt <= Date.now()) {
        markDeadlineReached();
        return;
      }

      const delayMs = getVotePollingDelayMs(
        baseIntervalMs,
        consecutivePollingErrorsRef.current,
      );
      pollingIntervalRef.current = setTimeout(async () => {
        pollingIntervalRef.current = null;
        if (cancelled || document.hidden) return;
        if (stopAt !== null && stopAt <= Date.now()) {
          markDeadlineReached();
          return;
        }
        await updateVoteDataPolling();
        if (!cancelled) scheduleNextPoll();
      }, delayMs) as unknown as NodeJS.Timeout;
    };

    const startPolling = async (refreshImmediately: boolean) => {
      clearPollingTimer();
      clearDeadlineTimer();
      clearFinalRefreshTimer();
      if (cancelled || document.hidden) return;

      setConnectionState(prev => ({
        ...prev,
        mode: 'polling',
        isConnected: true,
      }));
      setPollingStartTime(prev => prev ?? new Date());

      if (stopAt !== null && stopAt <= Date.now()) {
        markDeadlineReached();
        return;
      }

      setHasReachedVoteDeadline(false);
      scheduleDeadline();
      if (refreshImmediately) {
        await updateVoteDataPolling();
      }
      if (!cancelled) scheduleNextPoll();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearPollingTimer();
        clearDeadlineTimer();
        clearFinalRefreshTimer();
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        return;
      }
      void startPolling(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void startPolling(false);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPollingTimer();
      clearDeadlineTimer();
      clearFinalRefreshTimer();
      // 진행 중인 fetch 도 즉시 취소 (interval 외)
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [pollingInterval, updateVoteDataPolling, vote?.id, vote?.stop_at, voteId]);

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
    hasReachedVoteDeadline,
  };
}
