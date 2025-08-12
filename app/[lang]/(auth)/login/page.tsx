'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { SocialLoginButtons } from '@/components/client/auth/SocialLoginButtons';
import { useAuth } from '@/lib/supabase/auth-provider';
import Link from 'next/link';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { getLastLoginInfo, formatLastLoginTime, type LastLoginInfo } from '@/utils/storage';
import LanguageSelector from '@/components/layouts/LanguageSelector';
import { ArrowLeft } from 'lucide-react';

import { useLoginState } from '@/hooks/auth/useLoginState';
import { useEnvironmentCheck } from '@/hooks/auth/useEnvironmentCheck';
import { useAuthRedirect } from '@/hooks/auth/useAuthRedirect';
import { useAppleAuthHandler } from '@/hooks/auth/useAppleAuthHandler';
import { useOAuthError } from '@/hooks/auth/useOAuthError';

import { LoadingIndicator } from '@/components/client/auth/login/LoadingIndicator';
import { EnvErrorDisplay } from '@/components/client/auth/login/EnvErrorDisplay';
import { debugLog } from '@/utils/debug';

// AppleID 타입 정의 (전역)
declare global {
  interface Window {
    AppleID?: any;
  }
}

function LoginContentInner() {
  const { t, currentLanguage } = useLanguageStore();
  const { isAuthenticated, isLoading: isAuthLoading, isInitialized, user, userProfile } = useAuth();
  const {
    error,
    loading,
    setError,
    setLoading,
    handleLoginStart,
    handleLoginComplete,
    handleLoginError,
  } = useLoginState();
  const [mounted, setMounted] = useState<boolean>(false);
  const [lastLoginInfo, setLastLoginInfo] = useState<LastLoginInfo | null>(null);
  
  const envCheckFailed = useEnvironmentCheck(mounted);
  
  useAuthRedirect(mounted, isAuthenticated, envCheckFailed);
  useAppleAuthHandler(mounted, setLoading, setError);
  useOAuthError(mounted, setError);
  
  const providers: SocialLoginProvider[] = useMemo(() => {
    const base: SocialLoginProvider[] = ['google', 'apple'];
    // 프로덕션에서도 환경변수가 있으면 위챗 노출
    if (process.env.NEXT_PUBLIC_WECHAT_APP_ID) {
      base.push('wechat');
    } else if (process.env.NODE_ENV === 'development') {
      // 개발에서는 기본 노출하여 테스트 용이성 확보
      base.push('wechat');
    }
    return base;
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      setLastLoginInfo(getLastLoginInfo());
    } catch (e) {
      debugLog('최근 로그인 정보 로드 실패', e);
    }
  }, []);

  useEffect(() => {
    if (mounted && process.env.NODE_ENV === 'development') {
      debugLog('AuthProvider 상태 변경', {
        isAuthenticated,
        isAuthLoading,
        isInitialized,
        hasUser: !!user,
        hasUserProfile: !!userProfile,
        envCheckFailed,
      });
    }
  }, [mounted, isAuthenticated, isAuthLoading, isInitialized, user, userProfile, envCheckFailed]);

  if (!mounted || !isInitialized || envCheckFailed === null) {
    return <LoadingIndicator message='login_auth_system_initializing' />;
  }

  if (envCheckFailed) {
    return <EnvErrorDisplay error={error || t('login_service_maintenance_title')} />;
  }
  
  if (isAuthLoading || loading) {
      return <LoadingIndicator message='login_loading_text' />;
  }

  if (isAuthenticated) {
    return <LoadingIndicator message='login_complete_redirecting' />;
  }

  return (
      <div className='relative bg-white p-4 sm:p-6 md:p-8 lg:p-10 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-lg border border-gray-200 transition-shadow duration-200 hover:shadow-xl'>
        <div className='text-center mb-4 sm:mb-6 md:mb-8'>
        <p className='text-gray-600 text-sm sm:text-base'>{t('login_title')}</p>
        </div>

        {error && (
        <div className='bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-4 sm:mb-6 text-sm' role='alert'>
            <div className='flex items-center'>
            <svg className='w-4 h-4 mr-2 flex-shrink-0' fill='currentColor' viewBox='0 0 20 20'>
              <path fillRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z' clipRule='evenodd' />
              </svg>
              <span className='break-words'>{error}</span>
            </div>
          </div>
        )}

        {lastLoginInfo && (
          <div className='bg-blue-50 border border-blue-200 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-4 sm:mb-6'>
            <div className='flex items-center justify-center space-x-2'>
              <div className='flex items-center space-x-2'>
                <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
                <span className='text-blue-700 text-sm font-medium'>
                  {t('login_recent_login')}
                </span>
              </div>
            </div>
            <div className='text-center mt-1'>
              <span className='text-blue-600 text-sm'>
                {lastLoginInfo.providerDisplay} {t('login_recent_login_via')} •{' '}
                {formatLastLoginTime(lastLoginInfo.timestamp, currentLanguage)}
              </span>
            </div>
          </div>
        )}

        <div className='space-y-3 sm:space-y-4'>
          <SocialLoginButtons
            providers={providers}
            size='medium'
            onLoginStart={handleLoginStart}
            onLoginComplete={handleLoginComplete}
            onError={handleLoginError}
          lastLoginInfo={lastLoginInfo}
          />
        </div>

        <div className='mt-8 sm:mt-10 text-center relative'>
          <div className='relative inline-block'>
            <div className='absolute -inset-3 bg-gradient-to-r from-blue-50 via-purple-50 to-blue-50 rounded-2xl opacity-80 blur-sm'></div>
          <div className='relative'>
              <div className='space-y-3'>
                <div className='flex items-center justify-center space-x-2 text-sm sm:text-base font-medium flex-wrap'>
                  <span className='text-gray-800 font-semibold'>
                    {t('login_no_account_question')}
                  </span>
                  <a href="#social-login-buttons" className='font-semibold text-blue-600 hover:underline'>
                    {t('login_signup_link')}
                  </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <p className='text-gray-500 text-xs mt-6 text-center'>
        {t('login_terms_intro')}{' '}
        <Link href={`/${currentLanguage}/terms`} className='font-semibold text-blue-600 hover:underline'>
          {t('login_terms_of_service')}
        </Link>
        {' '}{t('login_terms_and')}{' '}
        <Link href={`/${currentLanguage}/privacy`} className='font-semibold text-blue-600 hover:underline'>
          {t('login_privacy_policy')}
        </Link>
        {t('login_terms_outro')}
      </p>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const { t } = useLanguageStore();

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <div className='relative min-h-screen flex flex-col items-center justify-center py-6 sm:py-10 px-4 sm:px-6 bg-white'>
      <div className='fixed top-4 left-4 z-50'>
        <button onClick={handleGoBack} className='flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:bg-white group' aria-label={t('login_back_button')}>
          <ArrowLeft className='w-5 h-5 sm:w-6 sm:h-6 text-gray-600 group-hover:text-gray-800 transition-colors' />
        </button>
      </div>

      <div className='fixed top-4 right-4 z-50'>
        <LanguageSelector />
      </div>

      <div className='relative z-10 mb-8 sm:mb-12'>
        <div className='text-center'>
          <div className='transition-transform duration-200 hover:scale-105 mb-3'>
            <Link href='/' className='group'>
                <div className='relative bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-gray-200 group-hover:shadow-2xl transition-all duration-300'>
                    <Image src='/images/logo.png' alt='Picnic Logo' width={48} height={48} className='w-12 h-12 sm:w-16 sm:h-16 mx-auto filter drop-shadow-lg' priority />
              </div>
            </Link>
          </div>
            <Link href='/' className='text-gray-500 hover:text-gray-700 text-sm transition-colors duration-200 hover:underline'>
            {t('login_home_button')}
          </Link>
        </div>
      </div>

      <div className='relative z-10 w-full max-w-sm sm:max-w-md'>
        <Suspense fallback={<LoadingIndicator message='login_loading_text' />}>
          <LoginContentInner />
        </Suspense>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <div className='min-h-screen bg-white flex flex-col'>
      <div className='flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8'>
        <div className='w-full max-w-sm sm:max-w-md'>
          <LoginContent />
        </div>
      </div>
    </div>
  );
}
