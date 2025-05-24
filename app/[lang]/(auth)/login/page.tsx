'use client';

import {Suspense, useCallback, useEffect, useState} from 'react';
import {supabase} from '@/utils/supabase-client';
import Image from 'next/image';
import {useSearchParams} from 'next/navigation';
import {useLanguageStore} from '@/stores/languageStore';
import Script from 'next/script';
import { SocialLoginButtons } from '@/components/client/auth';
import { useAuth } from '@/lib/supabase/auth-provider';
import Link from 'next/link';

// AppleID 타입 정의
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init(params: any): void;
        signIn(): Promise<{
          authorization: {
            id_token?: string;
            code?: string;
            state?: string;
          };
        }>;
      };
    };
  }
}

// 간단한 디버깅 함수 추가
const debugLog = (message: string, data?: any) => {
  console.log(`[DEBUG] ${message}`, data ? data : '');
  try {
    // 디버그 정보를 로컬 스토리지에 저장
    const debugLogs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
    debugLogs.push({
      timestamp: Date.now(),
      message,
      data
    });
    // 최대 50개 항목만 유지
    while (debugLogs.length > 50) {
      debugLogs.shift();
    }
    localStorage.setItem('debug_logs', JSON.stringify(debugLogs));
  } catch (e) {
    // 저장 실패 시 무시
  }
};

// SearchParams를 사용하는 컴포넌트
function LoginContentInner() {
  const searchParams = useSearchParams();
  const { t } = useLanguageStore();
  const { isLoading, isAuthenticated, isInitialized, user, userProfile, error: authError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 클라이언트에서만 렌더링되도록 보장
  useEffect(() => {
    setMounted(true);
  }, []);

  // AuthProvider 상태 디버깅
  useEffect(() => {
    if (mounted) {
      debugLog('AuthProvider 상태 변경', {
        isLoading,
        isAuthenticated,
        isInitialized,
        hasUser: !!user,
        hasUserProfile: !!userProfile,
        authError
      });
    }
  }, [mounted, isLoading, isAuthenticated, isInitialized, user, userProfile, authError]);

  // 오류 파라미터 처리
  useEffect(() => {
    if (!mounted) return;

    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const provider = searchParams.get('provider');
    const authError = searchParams.get('auth_error');

    // 오류 로컬 스토리지에서 확인
    const localErrorDescription = (() => {
      try {
        return localStorage.getItem('auth_error_description');
      } catch (e) {
        return null;
      }
    })();

    if (authError === 'true' || error) {
      // 먼저 디버그 로그 기록
      debugLog('인증 오류 발생', {
        error,
        errorDescription,
        authError,
        localErrorDescription,
        provider
      });

      // 오류 메시지 설정
      if (errorDescription) {
        setError(`인증 오류: ${decodeURIComponent(errorDescription)}`);
      } else if (localErrorDescription) {
        setError(`인증 오류: ${localErrorDescription}`);
        // 로컬 스토리지에서 사용 후 제거
        try {
          localStorage.removeItem('auth_error_description');
        } catch (e) {}
      } else if (error === 'invalid_request' || error === 'bad_oauth_callback') {
        setError('OAuth 인증 중 문제가 발생했습니다. 다시 시도해주세요.');
      } else if (error) {
        switch (error) {
          case 'missing_params':
            setError('필수 파라미터가 누락되었습니다.');
            break;
          case 'server_error':
            setError(`서버 오류가 발생했습니다: ${errorDescription || '알 수 없는 오류'}`);
            break;
          case 'oauth_error':
            setError(provider === 'apple'
              ? 'Apple 로그인 중 오류가 발생했습니다. 다시 시도해주세요.'
              : '소셜 로그인 중 오류가 발생했습니다.');
            break;
          case 'callback_error':
            setError('인증 처리 중 오류가 발생했습니다.');
            break;
          default:
            setError(`인증 오류가 발생했습니다: ${errorDescription || '알 수 없는 오류'}`);
        }
      } else {
        setError('로그인 중 알 수 없는 오류가 발생했습니다. 다시 시도해주세요.');
      }

      // URL에서 오류 파라미터 제거
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('error');
        url.searchParams.delete('error_description');
        url.searchParams.delete('auth_error');
        url.searchParams.delete('provider');
        window.history.replaceState({}, document.title, url.toString());
      }
    }
  }, [mounted, searchParams]);

  // 클라이언트에서 마운트되지 않았으면 로딩 표시
  if (!mounted) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
        <p className="text-gray-600">페이지 로딩 중...</p>
      </div>
    );
  }

  // 로딩 상태 또는 이미 인증된 상태 처리
  if (!isInitialized || isLoading) {
    debugLog('로딩 상태 표시', { isInitialized, isLoading });
    return (
      <div className="flex flex-col justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
        <p className="text-gray-600">
          {!isInitialized ? '인증 시스템 초기화 중...' : '로딩 중...'}
        </p>
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 text-xs text-gray-500 text-center">
            <p>디버그: isInitialized={String(isInitialized)}, isLoading={String(isLoading)}</p>
            <p>authError: {authError || 'none'}</p>
          </div>
        )}
      </div>
    );
  }

  if (isAuthenticated) {
    debugLog('이미 인증된 사용자');
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold mb-4">{t('label_already_logged_in')}</h2>
        <p className="mb-6">{t('message_already_logged_in')}</p>
        <Link 
          href="/"
          className="inline-block bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition-colors"
        >
          {t('button_go_to_home')}
        </Link>
      </div>
    );
  }

  debugLog('로그인 폼 표시');
  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-center">{t('label_login')}</h1>

      {/* 오류 메시지 표시 */}
      {(error || authError) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <span className="block sm:inline">{error || authError}</span>
        </div>
      )}

      {/* 소셜 로그인 버튼 */}
      <div className="mb-6">
        <h2 className="text-lg font-medium mb-4">{t('label_login_with_social')}</h2>
        <SocialLoginButtons 
          providers={['google', 'apple', 'kakao']} 
          onError={(error) => setError(error.message)}
          size="large"
        />
      </div>

      <div className="mt-6 text-center text-sm text-gray-600">
        <p>{t('label_no_account')} <Link href="/signup" className="text-primary-600 hover:underline">{t('button_signup')}</Link></p>
      </div>

      {/* 개발 환경에서만 디버그 정보 표시 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 p-3 bg-gray-100 rounded text-xs">
          <h3 className="font-bold mb-2">디버그 정보:</h3>
          <p>mounted: {String(mounted)}</p>
          <p>isInitialized: {String(isInitialized)}</p>
          <p>isLoading: {String(isLoading)}</p>
          <p>isAuthenticated: {String(isAuthenticated)}</p>
          <p>hasUser: {String(!!user)}</p>
          <p>hasUserProfile: {String(!!userProfile)}</p>
          <p>authError: {authError || 'none'}</p>
        </div>
      )}
    </div>
  );
}

function LoginContent() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white py-10 px-4">
      <div className="mb-8">
        <Link href="/">
          <Image
            src="/images/logo.png"
            alt="Picnic Logo"
            width={80}
            height={80}
            priority
            className="mx-auto"
          />
        </Link>
      </div>
      
      <Suspense fallback={
        <div className="flex flex-col justify-center items-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
          <p className="text-gray-600">페이지 로딩 중...</p>
        </div>
      }>
        <LoginContentInner />
      </Suspense>
    </div>
  );
}

export default function Login() {
  return <LoginContent />;
}
