/**
 * 시간 기반 다이얼로그 노출 유틸리티 (쿼리 기반)
 * 
 * URL 쿼리 파라미터를 통해 start_at, stop_at을 받아서
 * 서버 시간과 비교하여 노출 여부를 결정합니다.
 */

export interface TimeBasedDisplayQuery {
  /** 노출 시작 시간 (ISO 8601 문자열) */
  start_at?: string;
  /** 노출 종료 시간 (ISO 8601 문자열) */
  stop_at?: string;
  /** 디버그 모드 (강제 표시) */
  debug?: string;
}

export type TimeDisplayStatus = 'before' | 'active' | 'after';

/**
 * URL 쿼리에서 시간 기반 노출 설정을 파싱하는 함수
 */
export function parseTimeBasedQuery(searchParams: URLSearchParams): TimeBasedDisplayQuery {
  return {
    start_at: searchParams.get('start_at') || undefined,
    stop_at: searchParams.get('stop_at') || undefined,
    debug: searchParams.get('debug') || undefined,
  };
}

/**
 * 현재 시간을 기준으로 노출 상태를 확인하는 함수
 */
export function checkTimeBasedDisplay(
  query: TimeBasedDisplayQuery,
  currentTime: Date = new Date()
): {
  shouldDisplay: boolean;
  status: TimeDisplayStatus;
  message?: string;
} {
  const { start_at, stop_at, debug } = query;

  // 디버그 모드인 경우 항상 표시
  if (debug === 'true' || debug === '1') {
    return {
      shouldDisplay: true,
      status: 'active',
      message: '디버그 모드: 강제 표시'
    };
  }

  // 시간 제한이 없으면 항상 표시
  if (!start_at && !stop_at) {
    return {
      shouldDisplay: true,
      status: 'active'
    };
  }

  const now = currentTime.getTime();
  const startTime = start_at ? new Date(start_at).getTime() : null;
  const stopTime = stop_at ? new Date(stop_at).getTime() : null;

  // 시작 시간 전
  if (startTime && now < startTime) {
    return {
      shouldDisplay: false,
      status: 'before',
      message: `${new Date(start_at!).toLocaleString()}부터 이용 가능합니다.`
    };
  }

  // 종료 시간 후
  if (stopTime && now > stopTime) {
    return {
      shouldDisplay: false,
      status: 'after',
      message: `${new Date(stop_at!).toLocaleString()}에 종료되었습니다.`
    };
  }

  // 활성 시간대
  return {
    shouldDisplay: true,
    status: 'active'
  };
}

/**
 * 서버 시간을 가져와서 노출 상태를 확인하는 비동기 함수
 */
export async function checkTimeBasedDisplayWithServerTime(
  query: TimeBasedDisplayQuery
): Promise<{
  shouldDisplay: boolean;
  status: TimeDisplayStatus;
  message?: string;
  serverTime?: Date;
}> {
  try {
    // 서버 시간 가져오기
    const response = await fetch('/api/server-time');
    
    if (!response.ok) {
      console.warn('서버 시간 조회 실패, 클라이언트 시간 사용');
      return checkTimeBasedDisplay(query);
    }

    const data = await response.json();
    const serverTime = new Date(data.serverTime.iso);
    
    const result = checkTimeBasedDisplay(query, serverTime);
    
    return {
      ...result,
      serverTime
    };
  } catch (error) {
    console.warn('서버 시간 조회 중 오류, 클라이언트 시간 사용:', error);
    return checkTimeBasedDisplay(query);
  }
}

/**
 * 남은 시간을 계산하는 함수
 */
export function calculateRemainingTime(
  stopAt: string,
  currentTime: Date = new Date()
): { days: number; hours: number; minutes: number; seconds: number } | null {
  const stopTime = new Date(stopAt).getTime();
  const now = currentTime.getTime();
  const difference = stopTime - now;

  if (difference <= 0) return null;

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

/**
 * 시작까지 남은 시간을 계산하는 함수
 */
export function calculateTimeUntilStart(
  startAt: string,
  currentTime: Date = new Date()
): { days: number; hours: number; minutes: number; seconds: number } | null {
  const startTime = new Date(startAt).getTime();
  const now = currentTime.getTime();
  const difference = startTime - now;

  if (difference <= 0) return null;

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

/**
 * 시간을 사용자 친화적 형태로 포맷하는 함수
 */
export function formatTimeRemaining(time: { days: number; hours: number; minutes: number; seconds: number } | null): string | null {
  if (!time) return null;
  
  const { days, hours, minutes, seconds } = time;
  
  if (days > 0) {
    return `${days}일 ${hours}시간 ${minutes}분`;
  } else if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  } else if (minutes > 0) {
    return `${minutes}분 ${seconds}초`;
  } else {
    return `${seconds}초`;
  }
}

/**
 * 쿼리 기반 시간 체크 예시 URL들
 * 
 * 기본 사용법:
 * - ?start_at=2024-01-01T00:00:00Z&stop_at=2024-12-31T23:59:59Z
 * - ?start_at=2024-06-01T09:00:00+09:00&stop_at=2024-06-30T18:00:00+09:00
 * - ?debug=true (항상 표시)
 * - ?stop_at=2024-12-31T23:59:59Z (종료 시간만 설정)
 * - ?start_at=2024-06-01T09:00:00Z (시작 시간만 설정)
 */ 