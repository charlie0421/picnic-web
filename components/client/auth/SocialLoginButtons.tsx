'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { logAuth, AuthLog } from '@/utils/auth-logger';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useLanguageStore } from '@/stores/languageStore';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { getSocialAuthService } from '@/lib/supabase/social';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { Button } from '@/components/common/atoms/Button';
import { 
  sortProvidersByLastUsed
} from '@/utils/auth-helpers';
import type { LastLoginInfo } from '@/utils/storage';
import { useSearchParams, usePathname } from 'next/navigation';
import { getRedirectUrl, normalizeRedirectPath } from '@/utils/auth-redirect';
import { AntiAbuseError } from '@/lib/anti-abuse/handler';
import { RateLimitedDialog } from '@/components/anti-abuse/RateLimitedDialog';

interface SocialLoginButtonsProps {
  onLoginStart?: () => void;
  onLoginComplete?: () => void;
  onError?: (error: Error) => void;
  providers?: SocialLoginProvider[];
  size?: 'small' | 'medium' | 'large';
  lastLoginInfo: LastLoginInfo | null;
}

// 모든 환경에서 동일 처리: 로컬 특별 로직 제거

export function SocialLoginButtons({
  onLoginStart,
  onLoginComplete,
  onError,
  providers = ['google', 'apple'], // 'kakao' 임시 제거 - 웹에서 지원 안함
  size = 'medium',
  lastLoginInfo,
}: SocialLoginButtonsProps) {
  const [isLoading, setIsLoading] = useState<SocialLoginProvider | null>(null);
  const [rateLimitedChannel, setRateLimitedChannel] = useState<string | null>(null);
  const { t } = useLanguageStore();
  const { isLoading: authLoading } = useAuth();
  const { setIsLoading: setGlobalLoading } = useGlobalLoading();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const lastUsedProvider = (lastLoginInfo?.provider as SocialLoginProvider) || null;
  const sortedProviders = sortProvidersByLastUsed(providers, lastUsedProvider);


  const handleSocialLogin = useCallback(
    async (provider: SocialLoginProvider) => {

      console.log(`🔄 [SocialLogin] ${provider.toUpperCase()} 로그인 시작`);
      
      try {
        // 로딩 상태 설정 (다른 버튼들도 비활성화됨)
        setIsLoading(provider);
        setGlobalLoading(true); // 전역 로딩바 시작
        
        // 로그인 시작 콜백
        onLoginStart?.();
        logAuth(AuthLog.LoginStart, { provider });

        // 소셜 로그인 서비스 인스턴스 가져오기 (자동으로 Supabase 클라이언트 생성)
        const socialAuthService = getSocialAuthService();
        console.log(`🔗 [SocialLogin] ${provider.toUpperCase()} 인증 서비스 생성 완료`);

        // 선택된 제공자로 로그인 시도
        
        logAuth(AuthLog.ProviderInit, { provider });
        // 원복 목적지 계산: URL 쿼리의 returnTo > 저장된 redirectUrl > 현재 경로
        let desiredReturn = searchParams.get('returnTo') || getRedirectUrl() || pathname || '/';
        // 안전: 절대경로나 외부 URL 방지 (이미 유틸에서 검증하지만 간단히 한 번 더)
        if (desiredReturn.startsWith('http://') || desiredReturn.startsWith('https://')) {
          desiredReturn = '/';
        }

        // 폴백 강화를 위해 즉시 보관 (공급자/환경에 따라 쿼리 전달이 누락돼도 복구 가능)
        try {
          // 리다이렉트 경로는 항상 정규화해서 저장
          const normalizedReturn = normalizeRedirectPath(desiredReturn);
          // 리다이렉트에 사용하는 단일 키만 저장 (중복 방지)
          localStorage.setItem('auth_return_url', normalizedReturn);
          const maxAge = 15 * 60; // 15분
          document.cookie = `auth_return_url=${encodeURIComponent(normalizedReturn)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
          logAuth(AuthLog.SaveReturnUrl, { desiredReturn: normalizedReturn });
        } catch {}

        // KakaoTalk 인앱(안드로이드)에서는 구글이 웹뷰를 제한하므로 크롬 인텐트로 외부 브라우저에서 OAuth 시작
        const isKakaoAndroid = () => {
          if (typeof navigator === 'undefined') return false;
          const ua = navigator.userAgent || '';
          return /KAKAOTALK/i.test(ua) && /Android/i.test(ua);
        };

        if (provider === 'google' && typeof window !== 'undefined' && isKakaoAndroid()) {
          try {
            const origin = window.location.origin;
            const normalizedReturn = normalizeRedirectPath(desiredReturn);
            const target = `${origin}/api/auth/google?return_url=${encodeURIComponent(normalizedReturn)}`;
            const scheme = origin.startsWith('https') ? 'https' : 'http';
            const intent = `intent://${target.replace(/^https?:\/\//, '')}#Intent;scheme=${scheme};package=com.android.chrome;end`;
            console.log('🚪 Kakao Android 환경 감지 - Chrome 인텐트로 이동:', { target });
            window.location.href = intent;
            return; // 이후 로직 진행 필요 없음 (리다이렉트)
          } catch (e) {
            console.warn('Chrome 인텐트 리다이렉트 실패, 일반 경로로 진행:', e);
          }
        }

        const authResult = await socialAuthService.signInWithProvider(provider, {
          additionalParams: { return_url: normalizeRedirectPath(desiredReturn) },
        });

        logAuth(AuthLog.OAuthRedirect, { provider, success: authResult.success });
        
        if (authResult.success) {
          // 로그인 리다이렉트 성공 - 실제 인증 완료는 콜백에서 처리됨
          // (saveLastLoginProvider는 AuthCallback에서 실제 인증 성공 시 호출됨)
          
          console.log(`✅ [SocialLoginButtons] ${provider} 리다이렉트 성공`);
          onLoginComplete?.();
          // 성공 시에는 로딩 상태를 유지하여 리다이렉트까지 버튼 비활성화
        } else {
          // 오류 처리
          console.error(`❌ [SocialLoginButtons] ${provider} 로그인 실패:`, authResult.error);
          onError?.(authResult.error || new Error(t('unknown_login_error')));
          // 실패 시에만 로딩 상태 해제
          setIsLoading(null);
          setGlobalLoading(false); // 전역 로딩바 종료
        }
      } catch (error) {
        if (error instanceof AntiAbuseError) {
          // anti-abuse-signup-precheck 가 차단된 IP 면 throw — 사용자에게 dialog 노출.
          console.warn(`[SocialLogin] ${provider} 차단됨 (anti-abuse:${error.channel})`);
          setRateLimitedChannel(error.channel);
          setIsLoading(null);
          setGlobalLoading(false);
          return;
        }
        console.error(`💥 [SocialLoginButtons] ${provider} 소셜 로그인 오류:`, error);
        onError?.(
          error instanceof Error
            ? error
            : new Error(t('unknown_login_error')),
        );
        // 에러 시에만 로딩 상태 해제
        setIsLoading(null);
        setGlobalLoading(false); // 전역 로딩바 종료
      }
      // finally 블록 제거 - 성공 시에는 로딩 상태를 유지하여 리다이렉트까지 버튼 비활성화
    },
    [onLoginStart, onError, t, providers, setGlobalLoading, searchParams, pathname],
  );

  // 각 소셜 로그인 버튼의 스타일 및 내용 설정
  const providerConfig: Record<
    SocialLoginProvider,
    {
      label: string;
      bgColor: string;
      textColor: string;
      hoverColor: string;
      iconPath: string;
      borderColor?: string;
    }
  > = {
    google: {
      label: t('label_login_with_google') || 'Google로 로그인',
      bgColor: 'bg-white',
      textColor: 'text-gray-700',
      hoverColor: 'hover:bg-gray-50',
      iconPath: '/images/auth/google.svg',
      borderColor: 'border-gray-300',
    },
    apple: {
      label: t('label_login_with_apple') || 'Apple로 로그인',
      bgColor: 'bg-black',
      textColor: 'text-white',
      hoverColor: 'hover:bg-gray-900',
      iconPath: '/images/auth/apple.svg',
    },
    kakao: {
      label: t('label_login_with_kakao') || 'Kakao로 로그인',
      bgColor: 'bg-yellow-400',
      textColor: 'text-gray-900',
      hoverColor: 'hover:bg-yellow-500',
      iconPath: '/images/auth/kakao.svg',
    },
  };

  // 최근 사용한 provider가 있는지 확인
  const hasLastUsedProvider = lastUsedProvider && sortedProviders.includes(lastUsedProvider);
  const otherProviders = hasLastUsedProvider 
    ? sortedProviders.filter(p => p !== lastUsedProvider)
    : sortedProviders;

  return (
    <div className='flex flex-col w-full gap-2 sm:gap-3'>
      {rateLimitedChannel && (
        <RateLimitedDialog
          isOpen
          channel={rateLimitedChannel}
          onClose={() => setRateLimitedChannel(null)}
        />
      )}
      {/* 최근 사용한 로그인 수단 섹션 */}
      {hasLastUsedProvider && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 mb-2">
            <span className="h-px bg-gray-300 flex-1"></span>
            <span className="px-2 bg-white text-gray-500 font-medium">
              {t('label_last_used_login') || '최근 사용'}
            </span>
            <span className="h-px bg-gray-300 flex-1"></span>
          </div>
          
          {renderLoginButton(lastUsedProvider, true)}
          
          {otherProviders.length > 0 && (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 mt-4 mb-2">
              <span className="h-px bg-gray-300 flex-1"></span>
              <span className="px-2 bg-white text-gray-500 font-medium">
                {t('label_other_login_methods') || '다른 로그인 방법'}
              </span>
              <span className="h-px bg-gray-300 flex-1"></span>
            </div>
          )}
        </div>
      )}

      {/* 다른 로그인 수단들 */}
      {otherProviders.map((provider) => renderLoginButton(provider, false))}
      
      {/* 모든 제공자 동일 처리: 특별 안내 메시지 제거 */}
    </div>
  );

  function renderLoginButton(provider: SocialLoginProvider, isLastUsed: boolean) {
    const config = providerConfig[provider];
    // size에 따른 버튼 높이 조정 - 모바일에서 더 적절한 크기 제공
    const buttonHeight = size === 'small' 
      ? 'h-10 sm:h-9' 
      : size === 'large' 
      ? 'h-14 sm:h-16' 
      : isLastUsed
      ? 'h-14 sm:h-16' // 최근 사용한 버튼은 조금 더 크게
      : 'h-12 sm:h-14';

    // provider별 특별한 스타일링
    const getProviderStyle = () => {
      const baseStyle = isLastUsed ? 'ring-2 ring-blue-500 ring-opacity-50 ' : '';
      
      switch (provider) {
        case 'google':
          return baseStyle + 'bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg !text-gray-700 transform hover:scale-[1.02] active:scale-[0.98]';
        case 'apple':
          return baseStyle + 'bg-gradient-to-r from-gray-900 to-black hover:from-black hover:to-gray-900 border-2 border-gray-800 hover:border-gray-700 !text-white hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]';
        case 'kakao':
          return baseStyle + 'bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 border-2 border-yellow-400 hover:border-yellow-500 !text-gray-900 hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]';
        default:
          return baseStyle + 'bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 !text-gray-700';
      }
    };

    // 모든 제공자 동일 처리: 특별 비활성화 조건 제거

    return (
      <div key={provider} className="relative">
        <Button
          variant="ghost"
          onClick={() => handleSocialLogin(provider)}
          disabled={isLoading !== null || authLoading}
          className={`relative flex items-center justify-center w-full gap-2 sm:gap-3 ${buttonHeight} px-4 sm:px-6 rounded-lg sm:rounded-xl transition-all duration-300 font-medium text-xs sm:text-sm md:text-base shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${getProviderStyle()}`}
        >
          {/* 로딩 상태일 때의 오버레이 */}
          {isLoading === provider && (
            <div className="absolute inset-0 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
              <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          
          {/* 최근 사용 표시 */}
          {isLastUsed && (
            <div className="absolute -top-2 -right-2 z-10">
              <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full shadow-lg">
                {t('label_last_provider') || '최근'}
              </div>
            </div>
          )}
          
          {/* 아이콘 */}
          <div className={`flex items-center justify-center flex-shrink-0 ${size === 'large' || isLastUsed ? 'w-6 h-6 sm:w-8 sm:h-8' : 'w-5 h-5 sm:w-6 sm:h-6'} transition-transform duration-300 ${isLoading === provider ? 'scale-0' : 'scale-100'}`}>
            <Image
              src={config.iconPath}
              alt={`${provider.charAt(0).toUpperCase() + provider.slice(1)} 로그인`}
              width={size === 'large' || isLastUsed ? 24 : 20}
              height={size === 'large' || isLastUsed ? 24 : 20}
              className={`${size === 'large' || isLastUsed ? 'w-6 h-6 sm:w-8 sm:h-8' : 'w-5 h-5 sm:w-6 sm:h-6'} object-contain ${
                provider === 'apple' ? 'filter brightness-0 invert' : ''
              }`}
              priority={provider === 'google' || isLastUsed}
            />
          </div>
          
          {/* 텍스트 */}
          <span className={`font-medium text-xs sm:text-sm md:text-base whitespace-nowrap transition-all duration-300 ${
            provider === 'google' ? '!text-gray-700' :
            provider === 'apple' ? '!text-white' :
            provider === 'kakao' ? '!text-gray-900' : '!text-gray-700'
          } ${isLoading === provider ? 'opacity-0 translate-x-2' : 'opacity-100 translate-x-0'}`}>
            {isLoading === provider ? (t('label_logging_in') || '로그인 중...') : config.label}
          </span>

          {/* 버튼 하이라이트 효과 */}
          <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
        </Button>

      </div>
    );
  }
}
