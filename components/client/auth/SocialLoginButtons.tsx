'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/supabase/auth-provider';
import { useLanguageStore } from '@/stores/languageStore';
import { getSocialAuthService } from '@/lib/supabase/social';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';

interface SocialLoginButtonsProps {
  onLoginStart?: () => void;
  onLoginComplete?: () => void;
  onError?: (error: Error) => void;
  providers?: SocialLoginProvider[];
  size?: 'small' | 'medium' | 'large';
}

export default function SocialLoginButtons({
  onLoginStart,
  onLoginComplete,
  onError,
  providers = ['google', 'apple', 'kakao'],
  size = 'medium',
}: SocialLoginButtonsProps) {
  const { signInWithOAuth } = useAuth();
  const [isLoading, setIsLoading] = useState<SocialLoginProvider | null>(null);
  const { t } = useLanguageStore();

  const handleSocialLogin = useCallback(
    async (provider: SocialLoginProvider) => {
      try {
        // 로그인 시작 콜백
        onLoginStart?.();

        // 소셜 로그인 서비스 인스턴스 가져오기
        const socialAuthService = getSocialAuthService();

        // 선택된 제공자로 로그인 시도
        const result = await socialAuthService.signInWithProvider(provider,
          {
            redirectUrl: `${window.location.origin}/auth/callback/${provider}`,
          }
        );

        // 로그인 성공 시 (리디렉션 중)
        if (result.success) {
          // 리디렉션 중이므로 완료 콜백은 호출되지 않음
          // 사용자는 callback 처리 후에 리디렉션되어 돌아옴
          console.log(`${provider} 로그인 리디렉션 중...`);
        } else if (result.error) {
          // 오류 처리
          onError?.(result.error);
        }
      } catch (error) {
        console.error('소셜 로그인 오류:', error);
        onError?.(
          error instanceof Error
            ? error
            : new Error('알 수 없는 로그인 오류가 발생했습니다.'),
        );
      }
    },
    [onLoginStart, onError],
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
      label: t('label_login_with_google') || '구글로 로그인',
      bgColor: 'bg-white',
      textColor: 'text-gray-700',
      hoverColor: 'hover:bg-gray-50',
      iconPath: '/images/auth/google-logo.svg',
      borderColor: 'border-gray-300',
    },
    apple: {
      label: t('label_login_with_apple') || '애플로 로그인',
      bgColor: 'bg-black',
      textColor: 'text-white',
      hoverColor: 'hover:bg-gray-900',
      iconPath: '/images/auth/apple-logo.svg',
    },
    kakao: {
      label: t('label_login_with_kakao') || '카카오로 로그인',
      bgColor: 'bg-yellow-400',
      textColor: 'text-gray-900',
      hoverColor: 'hover:bg-yellow-500',
      iconPath: '/images/auth/kakao-logo.svg',
    },
    wechat: {
      label: t('label_login_with_wechat') || '위챗으로 로그인',
      bgColor: 'bg-green-500',
      textColor: 'text-white',
      hoverColor: 'hover:bg-green-600',
      iconPath: '/images/auth/wechat-logo.svg',
    },
  };

  return (
    <div className='flex flex-col w-full gap-4'>
      {providers.map((provider) => {
        const config = providerConfig[provider];
        // size에 따른 버튼 높이 조정
        const buttonHeight =
          size === 'small' ? 'h-10' : size === 'large' ? 'h-14' : 'h-12';

        // provider별 특별한 스타일링
        const getProviderStyle = () => {
          switch (provider) {
            case 'google':
              return 'bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 hover:shadow-lg text-gray-700 transform hover:scale-[1.02]';
            case 'apple':
              return 'bg-gradient-to-r from-gray-900 to-black hover:from-black hover:to-gray-900 border-2 border-gray-800 hover:border-gray-700 text-white hover:shadow-xl transform hover:scale-[1.02]';
            case 'kakao':
              return 'bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 border-2 border-yellow-400 hover:border-yellow-500 text-gray-900 hover:shadow-xl transform hover:scale-[1.02]';
            case 'wechat':
              return 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 border-2 border-green-500 hover:border-green-600 text-white hover:shadow-xl transform hover:scale-[1.02]';
            default:
              return 'bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-700';
          }
        };

        return (
          <button
            key={provider}
            type='button'
            className={`relative flex items-center justify-center w-full gap-3 ${buttonHeight} rounded-2xl transition-all duration-300 font-semibold text-sm md:text-base shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${getProviderStyle()}`}
            onClick={() => handleSocialLogin(provider)}
            disabled={isLoading === provider}
          >
            {/* 로딩 상태일 때의 오버레이 */}
            {isLoading === provider && (
              <div className="absolute inset-0 bg-white/20 rounded-2xl flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            
            {/* 아이콘 */}
            <div className={`flex items-center justify-center ${size === 'large' ? 'w-8 h-8' : 'w-6 h-6'} transition-transform duration-300 ${isLoading === provider ? 'scale-0' : 'scale-100'}`}>
              <Image
                src={`/images/auth/${provider}.svg`}
                alt={provider.charAt(0).toUpperCase() + provider.slice(1)}
                width={size === 'large' ? 28 : 22}
                height={size === 'large' ? 28 : 22}
                className={`${size === 'large' ? 'w-7 h-7' : 'w-5 h-5'} ${provider === 'apple' ? 'filter brightness-0 invert' : ''}`}
              />
            </div>
            
            {/* 텍스트 */}
            <span className={`transition-all duration-300 ${isLoading === provider ? 'opacity-0 translate-x-2' : 'opacity-100 translate-x-0'}`}>
              {isLoading === provider ? '로그인 중...' : config.label}
            </span>

            {/* 버튼 하이라이트 효과 */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          </button>
        );
      })}
    </div>
  );
}
