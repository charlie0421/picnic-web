import { useState, useEffect, useCallback } from 'react';

interface TimeZoneInfo {
  timeZone: string;
  offset: number;
  changed: boolean;
}

/**
 * 시간대 변경을 감지하는 커스텀 훅
 * 맥에서 시간대 변경 시 실시간으로 감지됩니다
 */
export function useTimeZoneDetection() {
  const [timeZoneInfo, setTimeZoneInfo] = useState<TimeZoneInfo>(() => {
    if (typeof window === 'undefined') {
      console.log('🌍 서버 사이드: UTC로 초기화');
      return {
        timeZone: 'UTC',
        offset: 0,
        changed: false,
      };
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = new Date().getTimezoneOffset();
    
    console.log('🌍 클라이언트 초기화:', {
      감지된_시간대: timeZone,
      오프셋: offset,
      현재_시간: new Date().toLocaleString()
    });
    
    return {
      timeZone,
      offset,
      changed: false,
    };
  });

  const checkTimeZone = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentOffset = new Date().getTimezoneOffset();
      
      // 디버깅을 위한 로그
      console.log('🔍 시간대 체크:', {
        현재_감지된_시간대: currentTimeZone,
        현재_오프셋: currentOffset,
        저장된_시간대: timeZoneInfo.timeZone,
        저장된_오프셋: timeZoneInfo.offset,
        변경됨: currentTimeZone !== timeZoneInfo.timeZone || currentOffset !== timeZoneInfo.offset
      });
      
      // 시간대 또는 오프셋이 변경되었는지 확인
      if (currentTimeZone !== timeZoneInfo.timeZone || currentOffset !== timeZoneInfo.offset) {
        console.log('🌍 시간대 변경 감지:', {
          이전: `${timeZoneInfo.timeZone} (오프셋: ${timeZoneInfo.offset})`,
          현재: `${currentTimeZone} (오프셋: ${currentOffset})`,
        });

        setTimeZoneInfo({
          timeZone: currentTimeZone,
          offset: currentOffset,
          changed: true,
        });

        // 변경 플래그를 잠시 후 리셋
        setTimeout(() => {
          setTimeZoneInfo(prev => ({ ...prev, changed: false }));
        }, 1000);
      }
    } catch (error) {
      console.warn('시간대 감지 실패:', error);
    }
  }, [timeZoneInfo.timeZone, timeZoneInfo.offset]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. 브라우저 포커스 이벤트 - 다른 앱에서 돌아올 때 체크
    const handleFocus = () => {
      setTimeout(checkTimeZone, 100); // 약간의 지연을 두어 시스템 변경 적용 시간 확보
    };

    // 2. 가시성 변경 이벤트 - 탭이 다시 활성화될 때 체크
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(checkTimeZone, 100);
      }
    };

    // 3. 페이지 포커스 이벤트
    const handlePageFocus = () => {
      setTimeout(checkTimeZone, 100);
    };

    // 4. 주기적 체크 (5분마다)
    const intervalId = setInterval(checkTimeZone, 5 * 60 * 1000);

    // 이벤트 리스너 등록
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 정리 함수
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [checkTimeZone]);

  return {
    timeZone: timeZoneInfo.timeZone,
    offset: timeZoneInfo.offset,
    changed: timeZoneInfo.changed,
    checkTimeZone,
  };
}

/**
 * 시간대 변경 감지 전용 훅 (간단한 버전)
 */
export function useTimeZone() {
  const { timeZone, changed } = useTimeZoneDetection();
  
  return {
    timeZone,
    changed,
  };
} 