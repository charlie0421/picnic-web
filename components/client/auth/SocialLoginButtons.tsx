'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useLanguageStore } from '@/stores/languageStore';
import { getSocialAuthService } from '@/lib/supabase/social';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { Button } from '@/components/common/atoms/Button';
import { 
  getLastLoginProvider, 
  sortProvidersByLastUsed
} from '@/utils/auth-helpers';

interface SocialLoginButtonsProps {
  onLoginStart?: () => void;
  onLoginComplete?: () => void;
  onError?: (error: Error) => void;
  providers?: SocialLoginProvider[];
  size?: 'small' | 'medium' | 'large';
}

/**
 * 로컬 개발 환경 감지
 */
function isLocalDevelopment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
}

export function SocialLoginButtons({
  onLoginStart,
  onLoginComplete,
  onError,
  providers = ['google', 'apple', 'kakao'],
  size = 'medium',
}: SocialLoginButtonsProps) {
  const [isLoading, setIsLoading] = useState<SocialLoginProvider | null>(null);
  const [lastUsedProvider, setLastUsedProvider] = useState<SocialLoginProvider | null>(null);
  const [sortedProviders, setSortedProviders] = useState<SocialLoginProvider[]>(providers);
  const { t } = useLanguageStore();
  const isLocal = isLocalDevelopment();
  const { isLoading: authLoading } = useAuth();

  // 컴포넌트 마운트 시 최근 사용한 로그인 수단을 확인
  useEffect(() => {
    const lastProvider = getLastLoginProvider();
    setLastUsedProvider(lastProvider);
    setSortedProviders(sortProvidersByLastUsed(providers));
  }, [providers]);

  const handleSocialLogin = useCallback(
    async (provider: SocialLoginProvider) => {
      // 로컬 환경에서 카카오 로그인 시도 시 에러 표시
      if (isLocal && provider === 'kakao') {
        onError?.(new Error('로컬 개발 환경에서는 카카오 로그인을 사용할 수 없습니다. 프로덕션 환경에서 테스트해주세요.'));
        return;
      }

      console.log(`🔄 [SocialLogin] ${provider.toUpperCase()} 로그인 시작`);
      
      try {
        // 로딩 상태 설정 (다른 버튼들도 비활성화됨)
        setIsLoading(provider);
        
        // 로그인 시작 콜백
        onLoginStart?.();

        // 소셜 로그인 서비스 인스턴스 가져오기 (자동으로 Supabase 클라이언트 생성)
        const socialAuthService = getSocialAuthService();
        console.log(`🔗 [SocialLogin] ${provider.toUpperCase()} 인증 서비스 생성 완료`);

        // 선택된 제공자로 로그인 시도
        console.log(`🔍 [SocialLoginButtons] ${provider} 로그인 서비스 호출 시작`);
        const authResult = await socialAuthService.signInWithProvider(provider);

        console.log(`🔗 [SocialLogin] ${provider.toUpperCase()} 인증 결과:`, authResult);
        
        if (authResult.success) {
          // 로그인 리다이렉트 성공 - 실제 인증 완료는 콜백에서 처리됨
          // (saveLastLoginProvider는 AuthCallback에서 실제 인증 성공 시 호출됨)
          
          console.log(`✅ [SocialLoginButtons] ${provider} 리다이렉트 성공`);
          onLoginComplete?.();
        } else {
          // 오류 처리
          console.error(`❌ [SocialLoginButtons] ${provider} 로그인 실패:`, authResult.error);
          onError?.(authResult.error || new Error(t('unknown_login_error')));
          // 실패 시에만 로딩 상태 해제
          setIsLoading(null);
        }
      } catch (error) {
        console.error(`💥 [SocialLoginButtons] ${provider} 소셜 로그인 오류:`, error);
        onError?.(
          error instanceof Error
            ? error
            : new Error(t('unknown_login_error')),
        );
        // 에러 시에만 로딩 상태 해제
        setIsLoading(null);
      }
      // finally 블록 제거 - 성공 시에는 로딩 상태를 유지하여 리다이렉트까지 버튼 비활성화
    },
    [onLoginStart, onError, t, isLocal, providers],
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
      label: isLocal ? '카카오 로그인 (로컬 환경에서 비활성화됨)' : (t('label_login_with_kakao') || 'Kakao로 로그인'),
      bgColor: 'bg-yellow-400',
      textColor: 'text-gray-900',
      hoverColor: 'hover:bg-yellow-500',
      iconPath: '/images/auth/kakao.svg',
    },
    wechat: {
      label: t('label_login_with_wechat') || 'WeChat으로 로그인',
      bgColor: 'bg-green-500',
      textColor: 'text-white',
      hoverColor: 'hover:bg-green-600',
      iconPath: '/images/auth/wechat.svg',
    },
  };

  // 최근 사용한 provider가 있는지 확인
  const hasLastUsedProvider = lastUsedProvider && sortedProviders.includes(lastUsedProvider);
  const otherProviders = hasLastUsedProvider 
    ? sortedProviders.filter(p => p !== lastUsedProvider)
    : sortedProviders;

  return (
    <div className='flex flex-col w-full gap-2 sm:gap-3'>
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
      
      {/* 로컬 환경에서 카카오 관련 안내 메시지 */}
      {isLocal && providers.includes('kakao') && (
        <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-2 sm:p-3 mt-1 sm:mt-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-orange-500">⚠️</span>
            <span className="text-xs sm:text-sm">로컬 개발 환경에서는 카카오 로그인이 비활성화됩니다. 프로덕션 환경에서 테스트해주세요.</span>
          </div>
        </div>
      )}
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
          // 로컬 환경에서는 비활성화 스타일 적용
          if (isLocal) {
            return 'bg-gray-300 border-2 border-gray-400 !text-gray-600 cursor-not-allowed opacity-60';
          }
          return baseStyle + 'bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 border-2 border-yellow-400 hover:border-yellow-500 !text-gray-900 hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]';
        case 'wechat':
          return baseStyle + 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 border-2 border-green-600 hover:border-green-700 !text-white hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]';
        default:
          return baseStyle + 'bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 !text-gray-700';
      }
    };

    // 카카오 버튼 비활성화 조건
    const isKakaoDisabled = isLocal && provider === 'kakao';

    return (
      <div key={provider} className="relative">
        <Button
          variant="ghost"
          onClick={() => handleSocialLogin(provider)}
          disabled={isLoading !== null || isKakaoDisabled || authLoading}
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
              } ${isKakaoDisabled ? 'grayscale' : ''}`}
              priority={provider === 'google' || isLastUsed}
              unoptimized={provider === 'wechat'} // WeChat SVG의 렌더링 문제 해결
            />
          </div>
          
          {/* 텍스트 */}
          <span className={`font-medium text-xs sm:text-sm md:text-base whitespace-nowrap transition-all duration-300 ${
            provider === 'google' ? '!text-gray-700' :
            provider === 'apple' ? '!text-white' :
            provider === 'kakao' ? (isKakaoDisabled ? '!text-gray-600' : '!text-gray-900') :
            provider === 'wechat' ? '!text-white' : '!text-gray-700'
          } ${isLoading === provider ? 'opacity-0 translate-x-2' : 'opacity-100 translate-x-0'}`}>
            {isLoading === provider ? (t('label_logging_in') || '로그인 중...') : 
             isLastUsed ? (t('label_continue_with_last_used') || '최근 사용한 방법으로 계속하기') :
             config.label}
          </span>

          {/* 버튼 하이라이트 효과 (비활성화되지 않은 경우에만) */}
          {!isKakaoDisabled && (
            <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          )}
        </Button>
        
        {/* 로컬 환경에서 카카오 버튼에 경고 툴팁 표시 */}
        {isKakaoDisabled && (
          <div className="absolute -top-2 -right-2 z-10">
            <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">!</span>
            </div>
          </div>
        )}
      </div>
    );
  }
}
