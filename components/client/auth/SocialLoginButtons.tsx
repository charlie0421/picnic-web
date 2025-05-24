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
        const result = await socialAuthService.signInWithProvider(provider);

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
    <div className='flex flex-col w-full gap-3'>
      {providers.map((provider) => {
        const config = providerConfig[provider];
        // size에 따른 버튼 높이 조정
        const buttonHeight =
          size === 'small' ? 'h-9' : size === 'large' ? 'h-12' : 'h-11';

        return (
          <button
            key={provider}
            type='button'
            className={`flex items-center justify-center w-full gap-2 ${buttonHeight} rounded-lg border ${
              config.borderColor || 'border-gray-300'
            } hover:bg-gray-50 transition-colors duration-300`}
            onClick={() => handleSocialLogin(provider)}
            disabled={isLoading === provider}
          >
            <Image
              src={`/images/auth/${provider}.svg`}
              alt={provider.charAt(0).toUpperCase() + provider.slice(1)}
              width={size === 'large' ? 24 : 20}
              height={size === 'large' ? 24 : 20}
              className={size === 'large' ? 'w-6 h-6' : 'w-5 h-5'}
            />
            <span>{config.label}</span>
            {isLoading === provider && (
              <span className='inline-block h-4 w-4 ml-2 animate-spin rounded-full border-2 border-gray-300 border-t-primary-500'></span>
            )}
          </button>
        );
      })}
    </div>
  );
}
