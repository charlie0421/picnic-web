import { useState, useEffect, useRef, useCallback } from 'react';
import { TimeBasedDisplay, TimeStatus } from '@/components/ui/Dialog/types';

interface ServerTimeResponse {
  success: boolean;
  serverTime: {
    iso: string;
    timestamp: number;
    utc: string;
    timezone: string;
    offset: number;
  };
}

/**
 * 서버 시간을 가져오는 함수
 */
async function fetchServerTime(): Promise<Date> {
  try {
    const response = await fetch('/api/server-time');
    if (!response.ok) {
      throw new Error(`Server time API failed: ${response.status}`);
    }
    
    const data: ServerTimeResponse = await response.json();
    if (!data.success) {
      throw new Error('Server time API returned error');
    }
    
    return new Date(data.serverTime.iso);
  } catch (error) {
    console.warn('서버 시간 조회 실패, 클라이언트 시간 사용:', error);
    return new Date(); // 폴백으로 클라이언트 시간 사용
  }
}

/**
 * 시간 기반 다이얼로그 노출 상태를 관리하는 훅
 */
export function useTimeBasedDisplay(config?: TimeBasedDisplay) {
  const [timeStatus, setTimeStatus] = useState<TimeStatus>('before');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [shouldDisplay, setShouldDisplay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousStatusRef = useRef<TimeStatus>('before');
  
  // 설정값들
  const {
    startAt,
    stopAt,
    useServerTime = true,
    checkInterval = 60000, // 1분
    onTimeExpired,
    onTimeStarted,
  } = config || {};

  /**
   * 현재 시간 상태를 계산하는 함수
   */
  const calculateTimeStatus = useCallback((now: Date): TimeStatus => {
    if (!startAt && !stopAt) return 'active'; // 시간 제한이 없으면 항상 활성
    
    const startTime = startAt ? new Date(startAt) : null;
    const stopTime = stopAt ? new Date(stopAt) : null;
    
    if (startTime && now < startTime) {
      return 'before';
    }
    
    if (stopTime && now > stopTime) {
      return 'after';
    }
    
    return 'active';
  }, [startAt, stopAt]);

  /**
   * 시간을 업데이트하고 상태를 확인하는 함수
   */
  const updateTimeAndStatus = useCallback(async () => {
    try {
      const now = useServerTime ? await fetchServerTime() : new Date();
      const status = calculateTimeStatus(now);
      
      setCurrentTime(now);
      setTimeStatus(status);
      setShouldDisplay(status === 'active');
      
      // 상태 변화 감지 및 콜백 호출
      const previousStatus = previousStatusRef.current;
      if (previousStatus !== status) {
        if (status === 'active' && previousStatus === 'before') {
          onTimeStarted?.();
        } else if (status === 'after' && previousStatus === 'active') {
          onTimeExpired?.();
        }
        previousStatusRef.current = status;
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('시간 업데이트 중 오류:', error);
      setIsLoading(false);
    }
  }, [useServerTime, calculateTimeStatus, onTimeStarted, onTimeExpired]);

  /**
   * 초기 로드 및 주기적 업데이트 설정
   */
  useEffect(() => {
    if (!config) {
      setIsLoading(false);
      setShouldDisplay(true);
      return;
    }

    // 즉시 한 번 실행
    updateTimeAndStatus();

    // 주기적 업데이트 설정
    if (checkInterval > 0) {
      intervalRef.current = setInterval(updateTimeAndStatus, checkInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [config, checkInterval, updateTimeAndStatus]);

  /**
   * 수동으로 시간을 새로고침하는 함수
   */
  const refreshTime = useCallback(() => {
    updateTimeAndStatus();
  }, [updateTimeAndStatus]);

  /**
   * 남은 시간을 계산하는 함수
   */
  const getRemainingTime = useCallback(() => {
    if (!stopAt || timeStatus === 'after') return null;
    
    const stopTime = new Date(stopAt);
    const difference = stopTime.getTime() - currentTime.getTime();
    
    if (difference <= 0) return null;
    
    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);
    
    return { days, hours, minutes, seconds };
  }, [stopAt, timeStatus, currentTime]);

  /**
   * 시작까지 남은 시간을 계산하는 함수
   */
  const getTimeUntilStart = useCallback(() => {
    if (!startAt || timeStatus !== 'before') return null;
    
    const startTime = new Date(startAt);
    const difference = startTime.getTime() - currentTime.getTime();
    
    if (difference <= 0) return null;
    
    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);
    
    return { days, hours, minutes, seconds };
  }, [startAt, timeStatus, currentTime]);

  return {
    /** 현재 시간 상태 */
    timeStatus,
    /** 현재 시간 */
    currentTime,
    /** 다이얼로그를 표시해야 하는지 여부 */
    shouldDisplay,
    /** 시간 정보 로딩 중인지 여부 */
    isLoading,
    /** 남은 시간 (종료까지) */
    remainingTime: getRemainingTime(),
    /** 시작까지 남은 시간 */
    timeUntilStart: getTimeUntilStart(),
    /** 수동으로 시간 새로고침 */
    refreshTime,
  };
} 