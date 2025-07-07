/**
 * 최근 로그인 정보 타입
 */
export interface LastLoginInfo {
  provider: string;
  providerDisplay: string;
  timestamp: string;
  userId: string;
}

/**
 * 로컬 스토리지 키 상수
 */
const STORAGE_KEYS = {
  LAST_LOGIN: 'picnic_last_login'
} as const;

/**
 * 최근 로그인 정보를 로컬 스토리지에서 가져오기
 */
export function getLastLoginInfo(): LastLoginInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LAST_LOGIN);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as LastLoginInfo;
    
    // 데이터 유효성 검사
    if (!parsed.provider || !parsed.timestamp || !parsed.userId) {
      console.warn('⚠️ [Storage] 잘못된 최근 로그인 정보 형식:', parsed);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('⚠️ [Storage] 최근 로그인 정보 읽기 실패:', error);
    return null;
  }
}

/**
 * 최근 로그인 정보를 로컬 스토리지에 저장
 */
export function setLastLoginInfo(loginInfo: LastLoginInfo): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.LAST_LOGIN, JSON.stringify(loginInfo));
    console.log('💾 [Storage] 최근 로그인 정보 저장 완료:', loginInfo);
    return true;
  } catch (error) {
    console.warn('⚠️ [Storage] 최근 로그인 정보 저장 실패:', error);
    return false;
  }
}

/**
 * 최근 로그인 정보를 로컬 스토리지에서 삭제
 */
export function clearLastLoginInfo(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_LOGIN);
    console.log('🗑️ [Storage] 최근 로그인 정보 삭제 완료');
    return true;
  } catch (error) {
    console.warn('⚠️ [Storage] 최근 로그인 정보 삭제 실패:', error);
    return false;
  }
}

/**
 * 최근 로그인 정보의 시간 포맷팅 (한국어)
 */
export function formatLastLoginTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return '방금 전';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}분 전`;
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  } catch (error) {
    console.warn('⚠️ [Storage] 시간 포맷팅 실패:', error);
    return '알 수 없음';
  }
}

/**
 * 최근 로그인 정보가 특정 사용자의 것인지 확인
 */
export function isLastLoginForUser(userId: string): boolean {
  const lastLogin = getLastLoginInfo();
  return lastLogin?.userId === userId;
} 