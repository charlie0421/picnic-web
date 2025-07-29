'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Provider } from '@supabase/supabase-js';

interface SocialLoginButtonsProps {
  onSocialLogin: (provider: Provider) => Promise<void>;
}

export function SocialLoginButtons({ onSocialLogin }: SocialLoginButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  const providers: Provider[] = ['google', 'apple', 'kakao']; // 카카오는 웹에서 기본 지원되지 않을 수 있음

  const handleLogin = async (provider: Provider) => {
    setLoadingProvider(provider);
    try {
      await onSocialLogin(provider);
      // 서버 액션이 리디렉션을 처리하므로, 별도의 완료 로직은 필요 없습니다.
    } catch (error) {
      console.error(`${provider} login error`, error);
      setLoadingProvider(null);
      // TODO: 사용자에게 에러 메시지 표시
    }
  };

  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <button
          key={provider}
          onClick={() => handleLogin(provider)}
          disabled={!!loadingProvider}
          className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loadingProvider === provider ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
          ) : (
            <>
              <Image
                src={`/images/auth/${provider}.svg`}
                alt={`${provider} logo`}
                width={20}
                height={20}
                className="mr-3"
              />
              <span>{`${provider.charAt(0).toUpperCase() + provider.slice(1)}로 로그인`}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
