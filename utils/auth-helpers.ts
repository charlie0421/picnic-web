import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { getLastLoginInfo, setLastLoginInfo, clearLastLoginInfo, type LastLoginInfo } from './storage';

const LAST_LOGIN_PROVIDER_KEY = 'picnic_last_login_provider'; // 레거시 키 (마이그레이션용)

/**
 * 최근 사용한 로그인 수단을 새로운 storage 시스템에 저장합니다.
 * @deprecated 이 함수는 auth-provider의 updateLastLoginInfo()에서 자동으로 처리됩니다.
 */
export function saveLastLoginProvider(provider: SocialLoginProvider): void {
  try {
    console.warn('⚠️ [auth-helpers] saveLastLoginProvider는 더 이상 사용되지 않습니다. auth-provider가 자동으로 처리합니다.');
    
    // 레거시 지원: 간단한 정보만 저장
    const loginInfo: LastLoginInfo = {
      provider: provider,
      providerDisplay: getProviderDisplayName(provider),
      timestamp: new Date().toISOString(),
      userId: '' // 사용자 ID는 알 수 없으므로 빈 문자열
    };
    
    setLastLoginInfo(loginInfo);
  } catch (error) {
    console.warn('최근 로그인 수단 저장 실패:', error);
  }
}

/**
 * 최근 사용한 로그인 수단을 새로운 storage 시스템에서 가져옵니다.
 */
export function getLastLoginProvider(): SocialLoginProvider | null {
  try {
    // 새로운 storage 시스템에서 먼저 확인
    const lastLoginInfo = getLastLoginInfo();
    if (lastLoginInfo?.provider) {
      // 유효한 provider인지 확인
      const validProviders: SocialLoginProvider[] = ['google', 'apple', 'kakao', 'wechat'];
      if (validProviders.includes(lastLoginInfo.provider as SocialLoginProvider)) {
        return lastLoginInfo.provider as SocialLoginProvider;
      }
    }

    // 레거시 시스템에서 확인 (마이그레이션용)
    if (typeof window !== 'undefined') {
      const lastProvider = localStorage.getItem(LAST_LOGIN_PROVIDER_KEY);
      if (lastProvider && ['google', 'apple', 'kakao', 'wechat'].includes(lastProvider)) {
        console.log('🔄 [auth-helpers] 레거시 로그인 정보 발견, 새로운 시스템으로 마이그레이션');
        
        // 레거시 데이터를 새로운 시스템으로 마이그레이션
        const loginInfo: LastLoginInfo = {
          provider: lastProvider as SocialLoginProvider,
          providerDisplay: getProviderDisplayName(lastProvider as SocialLoginProvider),
          timestamp: new Date().toISOString(),
          userId: ''
        };
        
        setLastLoginInfo(loginInfo);
        
        // 레거시 키 삭제
        localStorage.removeItem(LAST_LOGIN_PROVIDER_KEY);
        
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
    // 새로운 storage 시스템에서 삭제
    clearLastLoginInfo();
    
    // 레거시 키도 삭제
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
 * Provider 이름을 한국어 표시명으로 변환합니다.
 */
function getProviderDisplayName(provider: SocialLoginProvider): string {
  const displayNames: Record<SocialLoginProvider, string> = {
    google: 'Google',
    apple: 'Apple',
    kakao: 'Kakao',
    wechat: 'WeChat'
  };
  
  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
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