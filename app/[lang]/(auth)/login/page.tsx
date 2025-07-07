'use client';

import { Suspense, useCallback, useEffect, useState, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import Script from 'next/script';
import { SocialLoginButtons } from '@/components/client/auth/SocialLoginButtons';
import { useAuth } from '@/lib/supabase/auth-provider';
import Link from 'next/link';
import { handlePostLoginRedirect } from '@/utils/auth-redirect';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';

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

// 최적화된 디버깅 함수 - 개발 환경에서만 작동
const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV !== 'development') return;
  
  console.log(`[DEBUG] ${message}`, data ? data : '');
  
  // 로컬 스토리지 저장도 개발 환경에서만
  try {
    const debugLogs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
    debugLogs.push({
      timestamp: Date.now(),
      message,
      data,
    });
    // 최대 20개 항목만 유지 (50 → 20으로 축소)
    while (debugLogs.length > 20) {
      debugLogs.shift();
    }
    localStorage.setItem('debug_logs', JSON.stringify(debugLogs));
  } catch (e) {
    // 저장 실패 시 무시
  }
};

// SearchParams를 사용하는 컴포넌트
function LoginContentInner() {
  const { t } = useLanguageStore();
  const { isAuthenticated, isLoading, isInitialized, user, userProfile } = useAuth();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [envCheckFailed, setEnvCheckFailed] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 메모이제이션된 providers 배열
  const providers: SocialLoginProvider[] = useMemo(() => {
    return process.env.NODE_ENV === 'development' 
      ? ['google', 'apple', 'wechat'] // 'kakao' 제거 - 웹에서 지원 안함
      : ['google', 'apple']; // 'kakao' 제거 - 웹에서 지원 안함
  }, []);

  // 메모이제이션된 콜백 함수들
  const handleLoginStart = useCallback(() => {
    setLoading(true);
    setError('');
  }, []);

  const handleLoginComplete = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      debugLog('소셜 로그인 완료');
    }
    setLoading(false);
  }, []);

  const handleLoginError = useCallback((loginError: Error) => {
    if (process.env.NODE_ENV === 'development') {
      debugLog('소셜 로그인 오류', loginError);
    }
    setError(loginError.message);
    setLoading(false);
  }, []);

  // 컴포넌트 마운트 감지
  useEffect(() => {
    setMounted(true);
  }, []);

  // 환경 변수 확인 및 Supabase 클라이언트 상태 체크 - 최적화됨
  useEffect(() => {
    if (!mounted || envCheckFailed !== false) return; // 이미 체크했거나 실패한 경우 건너뛰기

    const checkEnvironment = () => {
      try {
        // 환경 변수 확인
        const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
        const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (process.env.NODE_ENV === 'development') {
          debugLog('환경 변수 상태 확인', {
            hasUrl,
            hasKey,
            url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...',
          });
        }

        if (!hasUrl || !hasKey) {
          console.error('❌ 필수 환경 변수가 누락되었습니다.', {
            'NEXT_PUBLIC_SUPABASE_URL': hasUrl,
            'NEXT_PUBLIC_SUPABASE_ANON_KEY': hasKey,
          });
          setEnvCheckFailed(true);
          setError('서버 설정 오류가 발생했습니다. 관리자에게 문의해주세요.');
          return;
        }

        // Supabase 클라이언트 테스트 - 간소화
        try {
          const testClient = createBrowserSupabaseClient();
          if (!testClient) {
            throw new Error('클라이언트 생성 실패');
          }
          if (process.env.NODE_ENV === 'development') {
            debugLog('✅ Supabase 클라이언트 생성 성공');
          }
        } catch (clientError) {
          console.error('❌ Supabase 클라이언트 생성 실패:', clientError);
          setEnvCheckFailed(true);
          setError('데이터베이스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
          return;
        }

        setEnvCheckFailed(false);
      } catch (error) {
        console.error('❌ 환경 확인 중 오류:', error);
        setEnvCheckFailed(true);
        setError('시스템 초기화 중 오류가 발생했습니다.');
      }
    };

    // 즉시 실행 (지연 제거)
    checkEnvironment();
  }, [mounted]);

  // AuthProvider 상태 디버깅 - 최적화됨
  useEffect(() => {
    if (mounted && process.env.NODE_ENV === 'development') {
      debugLog('AuthProvider 상태 변경', {
        isAuthenticated,
        isLoading,
        isInitialized,
        hasUser: !!user,
        hasUserProfile: !!userProfile,
        envCheckFailed,
      });
    }
  }, [mounted, isAuthenticated, isLoading, isInitialized, !!user, !!userProfile, envCheckFailed]);

  // 이미 인증된 사용자 리디렉트 처리 - 최상위로 이동
  useEffect(() => {
    if (mounted && isAuthenticated && !envCheckFailed) {
      debugLog('이미 인증된 사용자 - 즉시 리디렉트');
      const returnTo = searchParams.get('returnTo');
      const targetUrl = handlePostLoginRedirect(returnTo || undefined);
      router.replace(targetUrl); // push 대신 replace 사용하여 뒤로가기 방지
    }
  }, [mounted, isAuthenticated, router, envCheckFailed, searchParams]);

  // Apple OAuth 성공 상태 확인
  useEffect(() => {
    if (!mounted) return;

    const checkAppleAuthSuccess = async () => {
      try {
        const authSuccess = localStorage.getItem('authSuccess');
        const appleEmail = localStorage.getItem('appleEmail');
        const appleIdToken = localStorage.getItem('appleIdToken');
        const appleNonce = localStorage.getItem('appleNonce');

        if (authSuccess === 'true') {
          setLoading(true);
          debugLog('Apple OAuth 성공 감지, 세션 생성 시도', {
            hasIdToken: !!appleIdToken,
            hasNonce: !!appleNonce,
            hasEmail: !!appleEmail,
          });

          try {
            const supabase = createBrowserSupabaseClient();
            if (!appleIdToken || !appleNonce || !supabase) {
              debugLog(
                '❌ Apple ID Token, nonce 또는 Supabase 클라이언트 없음',
                {
                  hasIdToken: !!appleIdToken,
                  hasNonce: !!appleNonce,
                  hasSupabase: !!supabase,
                },
              );
              throw new Error('Apple ID Token 또는 nonce가 없습니다');
            }

            debugLog('✅ Apple ID Token과 nonce 확인됨, Supabase 인증 시도');

            // 1. 기존 사용자 세션 확인
            const {
              data: { user },
              error: userError,
            } = await supabase.auth.getUser();
            if (!userError && user) {
              debugLog('기존 세션 발견', {
                userId: user.id,
                email: user.email,
              });
              localStorage.setItem('sessionCreated', 'true');
              localStorage.removeItem('authSuccess');
              localStorage.removeItem('appleEmail');
              localStorage.removeItem('appleIdToken');
              localStorage.removeItem('appleNonce');

              // 리다이렉트 처리
              const returnTo = searchParams.get('returnTo');
              const targetUrl = handlePostLoginRedirect(returnTo || undefined);
              router.push(targetUrl);
              return;
            }

            // 2. Apple ID Token으로 Supabase 세션 생성 시도
            debugLog('Apple ID Token으로 Supabase 세션 생성 시도', {
              tokenLength: appleIdToken.length,
              nonceLength: appleNonce.length,
            });

            const { data: authData, error: authError } =
              await supabase.auth.signInWithIdToken({
                provider: 'apple',
                token: appleIdToken,
                nonce: appleNonce,
              });

            if (!authError && authData?.user) {
              debugLog('✅ Apple ID Token으로 Supabase 세션 생성 성공!', {
                userId: authData.user.id,
                email: authData.user.email,
              });

              localStorage.setItem('sessionCreated', 'true');
              localStorage.removeItem('authSuccess');
              localStorage.removeItem('appleEmail');
              localStorage.removeItem('appleIdToken');
              localStorage.removeItem('appleNonce');

              // 성공 메시지 표시 후 리다이렉트
              setError('Apple 로그인이 성공적으로 완료되었습니다!');
              setTimeout(() => {
                const returnTo = searchParams.get('returnTo');
                const targetUrl = handlePostLoginRedirect(returnTo || undefined);
                router.push(targetUrl);
              }, 1000);
              return;
            } else {
              debugLog(
                '❌ Apple ID Token으로 Supabase 세션 생성 실패',
                authError,
              );

              // 3. 대안: Apple 이메일로 매직 링크 시도
              if (appleEmail) {
                debugLog('대안: Apple 이메일로 매직 링크 시도', {
                  email: appleEmail,
                });

                const { error: magicLinkError } =
                  await supabase.auth.signInWithOtp({
                    email: appleEmail,
                    options: {
                      shouldCreateUser: true,
                      data: {
                        provider: 'apple',
                        apple_oauth: true,
                        full_name: 'Apple User',
                      },
                    },
                  });

                if (!magicLinkError) {
                  debugLog('✅ 매직 링크 성공');
                  localStorage.setItem('sessionCreated', 'true');
                  localStorage.removeItem('authSuccess');
                  localStorage.removeItem('appleEmail');
                  localStorage.removeItem('appleIdToken');
                  localStorage.removeItem('appleNonce');
                  setError(
                    'Apple 로그인이 거의 완료되었습니다. 이메일을 확인해주세요.',
                  );
                  return;
                } else {
                  debugLog('❌ 매직 링크 실패', magicLinkError);
                }
              }

              // 4. 모든 방법 실패
              throw new Error(
                `Apple 세션 생성 실패: ${
                  authError?.message || '알 수 없는 오류'
                }`,
              );
            }
          } catch (sessionError) {
            debugLog('세션 생성 중 오류', sessionError);
            setError(
              `Apple 로그인 후 세션 생성 중 오류가 발생했습니다: ${
                sessionError instanceof Error
                  ? sessionError.message
                  : '알 수 없는 오류'
              }`,
            );
          } finally {
            setLoading(false);
          }
        }
      } catch (e) {
        debugLog('Apple OAuth 상태 확인 중 오류', e);
      }
    };

    checkAppleAuthSuccess();
  }, [mounted, router]);

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
        provider,
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
      } else if (
        error === 'invalid_request' ||
        error === 'bad_oauth_callback'
      ) {
        // bad_oauth_state 에러 특별 처리
        const errorCode = searchParams.get('error_code');
        if (errorCode === 'bad_oauth_state') {
          setError('보안상의 이유로 로그인이 취소되었습니다. 브라우저를 새로고침하고 다시 시도해주세요.');
          
          // 관련 스토리지 정리
          try {
            localStorage.removeItem('auth_return_url');
            sessionStorage.clear();
          } catch (e) {
            console.warn('스토리지 정리 중 오류:', e);
          }
        } else {
          setError('OAuth 인증 중 문제가 발생했습니다. 다시 시도해주세요.');
        }
      } else if (error) {
        switch (error) {
          case 'missing_params':
            setError('필수 파라미터가 누락되었습니다.');
            break;
          case 'server_error':
            setError(
              `서버 오류가 발생했습니다: ${
                errorDescription || '알 수 없는 오류'
              }`,
            );
            break;
          case 'oauth_error':
            setError(
              provider === 'apple'
                ? 'Apple 로그인 중 오류가 발생했습니다. 다시 시도해주세요.'
                : '소셜 로그인 중 오류가 발생했습니다.',
            );
            break;
          case 'callback_error':
            setError('인증 처리 중 오류가 발생했습니다.');
            break;
          default:
            setError(
              `인증 오류가 발생했습니다: ${
                errorDescription || '알 수 없는 오류'
              }`,
            );
        }
      } else {
        setError(
          '로그인 중 알 수 없는 오류가 발생했습니다. 다시 시도해주세요.',
        );
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
  }, [mounted, searchParams, router]);

  // 클라이언트에서 마운트되지 않았으면 로딩 표시
  if (!mounted) {
    return (
      <div className='flex flex-col justify-center items-center min-h-[60vh] sm:min-h-[70vh]'>
        <div className='animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-t-2 border-b-2 border-primary-500 mb-3 sm:mb-4'></div>
        <p className='text-gray-600 text-sm sm:text-base'>로딩 중...</p>
      </div>
    );
  }

  // 환경 변수 오류가 있으면 오류 페이지 표시
  if (envCheckFailed) {
    return (
      <div className='flex flex-col justify-center items-center min-h-[400px] p-8'>
        <div className='max-w-md text-center'>
          <div className='mb-6'>
            <svg className='w-16 h-16 mx-auto text-red-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z' />
            </svg>
          </div>
          <h3 className='text-xl font-semibold text-gray-900 mb-4'>서비스 일시 중단</h3>
          <p className='text-gray-600 mb-6'>{error}</p>
          <div className='space-y-3'>
            <button
              onClick={() => window.location.reload()}
              className='w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors'
            >
              페이지 새로고침
            </button>
            <button
              onClick={() => router.push('/')}
              className='w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors'
            >
              홈으로 돌아가기
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <div className='mt-6 p-4 bg-red-50 rounded-lg border border-red-200 text-left'>
              <h4 className='font-semibold text-red-800 mb-2'>개발자 정보:</h4>
              <div className='text-sm text-red-700 space-y-1'>
                <p>• NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '❌ 누락'}</p>
                <p>• NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '설정됨' : '❌ 누락'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 로딩 상태 또는 이미 인증된 상태 처리
  if (!isInitialized || isLoading) {
    if (process.env.NODE_ENV === 'development') {
      debugLog('로딩 상태 표시', { isInitialized, isLoading });
    }
    return (
      <div className='flex flex-col justify-center items-center min-h-[400px]'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4'></div>
        <p className='text-gray-600'>
          {!isInitialized ? '인증 시스템 초기화 중...' : '로딩 중...'}
        </p>
        
        {/* 🔍 디버깅 정보 (개발 환경에서만) */}
        {process.env.NODE_ENV === 'development' && (
          <>
            <div className='mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded border max-w-sm'>
              <div className='font-semibold mb-2'>🔍 상태 확인:</div>
              <div>• isInitialized: {String(isInitialized)}</div>
              <div>• isLoading: {String(isLoading)}</div>
              <div>• mounted: {String(mounted)}</div>
              <div>• envCheckFailed: {String(envCheckFailed)}</div>
              <div>• isAuthenticated: {String(isAuthenticated)}</div>
              <div>• hasUser: {String(!!user)}</div>
              <div>• hasUserProfile: {String(!!userProfile)}</div>
              <div>• 환경체크: URL={String(!!process.env.NEXT_PUBLIC_SUPABASE_URL)}, KEY={String(!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}</div>
              <div>• timestamp: {new Date().toISOString().split('.')[0]}</div>
            </div>
            
            {/* 🔧 새로고침 버튼 */}
            <button 
              onClick={() => window.location.reload()} 
              className="mt-3 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
            >
              🔄 새로고침
            </button>
          </>
        )}
        
        {process.env.NODE_ENV === 'development' && (
          <div className='mt-4 text-xs text-gray-500 text-center'>
            <p>
              디버그: isInitialized={String(isInitialized)}, isLoading=
              {String(isLoading)}
            </p>
            <p className='mt-2'>
              환경: URL={!!process.env.NEXT_PUBLIC_SUPABASE_URL}, KEY={!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isAuthenticated) {
    // 리디렉트 중 간단한 로딩 표시
    return (
      <div className='flex flex-col justify-center items-center min-h-[400px]'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4'></div>
        <p className='text-gray-600'>로그인 완료 - 페이지 이동 중...</p>
      </div>
    );
  }

  // 인증 상태가 초기화되지 않은 경우 대기 화면 표시
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            인증 시스템 초기화 중
          </h2>
          <p className="text-gray-600 mb-4">
            잠시만 기다려주세요...
          </p>
          
          {/* 🔍 디버깅 정보 (개발 환경에서만) */}
          {process.env.NODE_ENV === 'development' && (
            <>
              <div className="text-left text-xs text-gray-500 bg-gray-50 p-3 rounded border-l-4 border-blue-400">
                <div className="font-semibold mb-2">📊 상태 정보:</div>
                <div>• isLoading: {String(isLoading)}</div>
                <div>• isInitialized: {String(isInitialized)}</div>
                <div>• isAuthenticated: {String(isAuthenticated)}</div>
                <div>• hasUser: {String(!!user)}</div>
                <div>• hasUserProfile: {String(!!userProfile)}</div>
                <div>• hasSupabaseUrl: {String(!!process.env.NEXT_PUBLIC_SUPABASE_URL)}</div>
                <div>• hasSupabaseKey: {String(!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}</div>
                <div>• timestamp: {new Date().toISOString().split('.')[0]}</div>
              </div>
              
              {/* 🔧 강제 새로고침 버튼 */}
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                🔄 새로고침
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (process.env.NODE_ENV === 'development') {
    debugLog('로그인 폼 표시');
  }
  return (
    <div className='relative max-w-sm sm:max-w-lg mx-auto'>
      {/* 메인 로그인 카드 */}
      <div className='relative bg-white p-4 sm:p-6 md:p-8 lg:p-10 rounded-xl sm:rounded-2xl md:rounded-3xl shadow-lg border border-gray-200 transition-shadow duration-200 hover:shadow-xl'>
        {/* 웰컴 헤더 */}
        <div className='text-center mb-4 sm:mb-6 md:mb-8'>
          <p className='text-gray-600 text-sm sm:text-base'>{t('login_title')}</p>
        </div>

        {/* 오류 메시지 표시 */}
        {error && (
          <div
            className='bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-4 sm:mb-6 text-sm'
            role='alert'
          >
            <div className='flex items-center'>
              <svg
                className='w-4 h-4 mr-2 flex-shrink-0'
                fill='currentColor'
                viewBox='0 0 20 20'
              >
                <path
                  fillRule='evenodd'
                  d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z'
                  clipRule='evenodd'
                />
              </svg>
              <span className='break-words'>{error}</span>
            </div>
          </div>
        )}

        {/* 소셜 로그인 버튼들 */}
        <div className='space-y-3 sm:space-y-4'>
          <SocialLoginButtons
            providers={providers}
            size='medium'
            onLoginStart={handleLoginStart}
            onLoginComplete={handleLoginComplete}
            onError={handleLoginError}
          />
        </div>

        {/* 하단 안내 */}
        <div className='mt-8 sm:mt-10 text-center relative'>
          <div className='relative inline-block'>
            <div className='absolute -inset-3 bg-gradient-to-r from-blue-50 via-purple-50 to-blue-50 rounded-2xl opacity-80 blur-sm'></div>
            <div className='relative bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent'>
              <div className='space-y-3'>
                <div className='flex items-center justify-center space-x-2 text-sm sm:text-base font-medium'>
                  <span className='bg-blue-100 text-blue-600 p-1.5 rounded-full'>
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" className='w-3.5 h-3.5'>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span className='text-gray-800 font-semibold'>계정이 없으신가요?</span>
                </div>
                <div className='text-gray-600 text-sm leading-relaxed max-w-sm mx-auto px-4'>
                  <span className='inline-flex items-center space-x-1'>
                    <span>위의</span>
                    <span className='bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-semibold'>소셜 로그인</span>
                    <span>으로</span>
                    <span className='bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent font-semibold'>자동 회원가입</span>
                    <span>됩니다</span>
                    <span className='text-blue-600'>✨</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>



        {/* 개발 환경에서만 디버그 정보 표시 */}
        {process.env.NODE_ENV === 'development' && (
          <div className='mt-6 sm:mt-8 p-3 sm:p-4 bg-gray-50/80 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-gray-200/50'>
            <details className='text-xs text-gray-700'>
              <summary className='font-semibold cursor-pointer hover:text-blue-600 transition-colors'>
                🐛 디버그 정보 (클릭하여 펼치기)
              </summary>
              <div className='mt-3 space-y-1 pl-4 border-l-2 border-blue-200'>
                <div className='flex justify-between'>
                  <span>mounted:</span>{' '}
                  <code className='text-blue-600'>{String(mounted)}</code>
                </div>
                <div className='flex justify-between'>
                  <span>isInitialized:</span>{' '}
                  <code className='text-blue-600'>{String(isInitialized)}</code>
                </div>
                <div className='flex justify-between'>
                  <span>isLoading:</span>{' '}
                  <code className='text-blue-600'>{String(isLoading)}</code>
                </div>
                <div className='flex justify-between'>
                  <span>isAuthenticated:</span>{' '}
                  <code className='text-blue-600'>
                    {String(isAuthenticated)}
                  </code>
                </div>
                <div className='flex justify-between'>
                  <span>hasUser:</span>{' '}
                  <code className='text-blue-600'>{String(!!user)}</code>
                </div>
                <div className='flex justify-between'>
                  <span>hasUserProfile:</span>{' '}
                  <code className='text-blue-600'>{String(!!userProfile)}</code>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginContent() {
  return (
    <div className='relative min-h-screen flex flex-col items-center justify-center py-6 sm:py-10 px-4 sm:px-6 bg-white'>

      {/* 로고 섹션 */}
      <div className='relative z-10 mb-8 sm:mb-12 transition-transform duration-200 hover:scale-105'>
        <Link href='/' className='group'>
          <div className='relative'>
            <div className='relative bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-gray-200 group-hover:shadow-2xl transition-all duration-300'>
              <Image
                src='/images/logo.png'
                alt='Picnic Logo'
                width={48}
                height={48}
                className='w-12 h-12 sm:w-16 sm:h-16 mx-auto filter drop-shadow-lg'
                priority
              />
            </div>
          </div>
        </Link>
      </div>

      <div className='relative z-10 w-full max-w-sm sm:max-w-md'>
        <Suspense
          fallback={
            <div className='flex flex-col justify-center items-center min-h-[60vh] sm:min-h-[70vh]'>
              <div className='animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-t-2 border-b-2 border-primary-500 mb-3 sm:mb-4'></div>
              <p className='text-gray-600 text-sm sm:text-base'>로딩 중...</p>
            </div>
          }
        >
          <LoginContentInner />
        </Suspense>
      </div>

    </div>
  );
}

export default function Login() {
  return (
    <div className='min-h-screen bg-white flex flex-col'>
      {/* 메인 컨테이너 */}
      <div className='flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8'>
        <div className='w-full max-w-sm sm:max-w-md'>
          <LoginContent />
        </div>
      </div>
    </div>
  );
}
