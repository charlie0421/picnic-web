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

/**
 * 최근 로그인 수단이 저장되어 있는지 확인합니다.
 */
export function hasLastLoginProvider(): boolean {
  return getLastLoginProvider() !== null;
}

/**
 * 특정 provider가 최근 사용한 수단인지 확인합니다.
 */
export function isLastUsedProvider(provider: SocialLoginProvider): boolean {
  return getLastLoginProvider() === provider;
}

/**
 * 로그인 수단 사용 통계를 위한 간단한 카운터 (선택사항)
 */
export function incrementProviderUsage(provider: SocialLoginProvider): void {
  try {
    if (typeof window !== 'undefined') {
      const key = `picnic_provider_usage_${provider}`;
      const currentCount = parseInt(localStorage.getItem(key) || '0', 10);
      localStorage.setItem(key, (currentCount + 1).toString());
    }
  } catch (error) {
    console.warn('로그인 수단 사용 통계 업데이트 실패:', error);
  }
}

/**
 * 모든 로그인 관련 통계 데이터를 삭제합니다.
 */
export function clearProviderUsageStats(): void {
  try {
    if (typeof window !== 'undefined') {
      const providers: SocialLoginProvider[] = ['google', 'apple', 'kakao', 'wechat'];
      providers.forEach(provider => {
        localStorage.removeItem(`picnic_provider_usage_${provider}`);
      });
    }
  } catch (error) {
    console.warn('로그인 수단 통계 삭제 실패:', error);
  }
} 