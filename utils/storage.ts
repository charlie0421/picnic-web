import { formatRelativeTime, type SupportedLanguage } from './date';

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
 * 중복 저장 방지: 동일한 정보가 이미 저장되어 있으면 저장하지 않음
 */
export function setLastLoginInfo(loginInfo: LastLoginInfo): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    // 데이터 유효성 검사
    if (!loginInfo.provider || !loginInfo.timestamp || !loginInfo.userId) {
      console.warn('⚠️ [Storage] 잘못된 최근 로그인 정보:', loginInfo);
      return false;
    }

    const serialized = JSON.stringify(loginInfo);
    localStorage.setItem(STORAGE_KEYS.LAST_LOGIN, serialized);
    
    console.log('✅ [Storage] 최근 로그인 정보 저장 완료:', {
      provider: loginInfo.provider,
      userId: loginInfo.userId,
      timestamp: loginInfo.timestamp
    });
    
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
    console.log('✅ [Storage] 최근 로그인 정보 삭제 완료');
    return true;
  } catch (error) {
    console.warn('⚠️ [Storage] 최근 로그인 정보 삭제 실패:', error);
    return false;
  }
}

/**
 * 최근 로그인 정보의 시간 포맷팅 (국제화 지원)
 */
export function formatLastLoginTime(timestamp: string, language: SupportedLanguage = 'ko'): string {
  try {
    return formatRelativeTime(timestamp, language, {
      useAbsolute: true,
      absoluteThreshold: 7,
      showTime: false
    });
  } catch (error) {
    console.warn('⚠️ [Storage] 시간 포맷팅 실패:', error);
    // 언어별 폴백 메시지
    const fallbackMessages = {
      ko: '알 수 없음',
      en: 'Unknown',
      ja: '不明',
      zh: '未知',
      id: 'Tidak diketahui'
    };
    return fallbackMessages[language] || fallbackMessages.ko;
  }
}

/**
 * 특정 사용자의 최근 로그인 정보인지 확인
 */
export function isLastLoginForUser(userId: string): boolean {
  const lastLogin = getLastLoginInfo();
  return lastLogin?.userId === userId;
} 