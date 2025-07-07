import type { SocialLoginProvider } from '@/lib/supabase/social/types';

const LAST_LOGIN_PROVIDER_KEY = 'picnic_last_login_provider';

/**
 * 최근 사용한 로그인 수단을 로컬스토리지에 저장합니다.
 */
export function saveLastLoginProvider(provider: SocialLoginProvider): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_LOGIN_PROVIDER_KEY, provider);
    }
  } catch (error) {
    console.warn('최근 로그인 수단 저장 실패:', error);
  }
}

/**
 * 최근 사용한 로그인 수단을 로컬스토리지에서 가져옵니다.
 */
export function getLastLoginProvider(): SocialLoginProvider | null {
  try {
    if (typeof window !== 'undefined') {
      const lastProvider = localStorage.getItem(LAST_LOGIN_PROVIDER_KEY);
      // 유효한 provider인지 확인
      if (lastProvider && ['google', 'apple', 'kakao', 'wechat'].includes(lastProvider)) {
        return lastProvider as SocialLoginProvider;
      }
    }
  } catch (error) {
    console.warn('최근 로그인 수단 불러오기 실패:', error);
  }
  return null;
}

/**
 * 최근 사용한 로그인 수단 정보를 삭제합니다.
 */
export function clearLastLoginProvider(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LAST_LOGIN_PROVIDER_KEY);
    }
  } catch (error) {
    console.warn('최근 로그인 수단 삭제 실패:', error);
  }
}

/**
 * provider 배열을 최근 사용한 것을 우선순위로 정렬합니다.
 */
export function sortProvidersByLastUsed(providers: SocialLoginProvider[]): SocialLoginProvider[] {
  const lastProvider = getLastLoginProvider();
  if (!lastProvider || !providers.includes(lastProvider)) {
    return providers;
  }
  
  // 최근 사용한 provider를 맨 앞으로 이동
  return [lastProvider, ...providers.filter(p => p !== lastProvider)];
} 