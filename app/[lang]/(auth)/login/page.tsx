'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import Script from 'next/script';
import { SocialLoginButtons } from '@/components/client/auth';
import { useAuth } from '@/lib/supabase/auth-provider';
import Link from 'next/link';
import { handlePostLoginRedirect } from '@/utils/auth-redirect';

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
      data,
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
  const { t } = useLanguageStore();
  const { isAuthenticated, isLoading, isInitialized, user, userProfile } = useAuth();
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [envCheckFailed, setEnvCheckFailed] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 컴포넌트 마운트 감지
  useEffect(() => {
    setMounted(true);
  }, []);

  // 환경 변수 확인 및 Supabase 클라이언트 상태 체크
  useEffect(() => {
    if (!mounted) return;

    const checkEnvironment = () => {
      try {
        // 환경 변수 확인
        const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
        const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        debugLog('환경 변수 상태 확인', {
          hasUrl,
          hasKey,
          url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...',
        });

        if (!hasUrl || !hasKey) {
          console.error('❌ 필수 환경 변수가 누락되었습니다.', {
            'NEXT_PUBLIC_SUPABASE_URL': hasUrl,
            'NEXT_PUBLIC_SUPABASE_ANON_KEY': hasKey,
          });
          setEnvCheckFailed(true);
          setError('서버 설정 오류가 발생했습니다. 관리자에게 문의해주세요.');
          return;
        }

        // Supabase 클라이언트 테스트
        try {
          const testClient = createBrowserSupabaseClient();
          if (!testClient) {
            throw new Error('클라이언트 생성 실패');
          }
          debugLog('✅ Supabase 클라이언트 생성 성공');
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

    // 약간의 지연 후 환경 체크 (AuthProvider 초기화 대기)
    const timeoutId = setTimeout(checkEnvironment, 100);
    return () => clearTimeout(timeoutId);
  }, [mounted]);

  // AuthProvider 상태 디버깅
  useEffect(() => {
    if (mounted) {
      debugLog('AuthProvider 상태 변경', {
        isAuthenticated,
        isLoading,
        isInitialized,
        hasUser: !!user,
        hasUserProfile: !!userProfile,
        envCheckFailed,
      });
    }
  }, [mounted, isAuthenticated, isLoading, isInitialized, user, userProfile, envCheckFailed]);

  // 이미 인증된 사용자 리디렉트 처리 - 최상위로 이동
  useEffect(() => {
    if (mounted && isAuthenticated && !envCheckFailed) {
      debugLog('이미 인증된 사용자 - 즉시 리디렉트');
      const targetUrl = handlePostLoginRedirect();
      router.replace(targetUrl); // push 대신 replace 사용하여 뒤로가기 방지
    }
  }, [mounted, isAuthenticated, router, envCheckFailed]);

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
              const targetUrl = handlePostLoginRedirect();
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
                const targetUrl = handlePostLoginRedirect();
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
      <div className='flex flex-col justify-center items-center min-h-[400px]'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4'></div>
        <p className='text-gray-600'>페이지 로딩 중...</p>
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
    debugLog('로딩 상태 표시', { isInitialized, isLoading });
    return (
      <div className='flex flex-col justify-center items-center min-h-[400px]'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4'></div>
        <p className='text-gray-600'>
          {!isInitialized ? '인증 시스템 초기화 중...' : '로딩 중...'}
        </p>
        
        {/* 🔍 Production 디버깅 정보 (항상 표시) */}
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            인증 시스템 초기화 중
          </h2>
          <p className="text-gray-600 mb-4">
            잠시만 기다려주세요...
          </p>
          
          {/* 🔍 디버깅 정보 (Production에서 임시 표시) */}
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
        </div>
      </div>
    );
  }

  debugLog('로그인 폼 표시');
  return (
    <div className='relative max-w-lg mx-auto'>
      {/* 배경 그라디언트 카드 */}
      <div className='absolute inset-0 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-3xl blur-xl opacity-20 animate-pulse'></div>

      {/* 메인 로그인 카드 */}
      <div className='relative bg-white/90 backdrop-blur-xl p-8 md:p-10 rounded-3xl shadow-2xl border border-white/20 transform transition-all duration-500 hover:scale-[1.02] hover:shadow-3xl'>
        {/* 웰컴 헤더 */}
        <div className='text-center mb-8'>
          <p className='text-gray-600'>{t('login_title')}</p>
        </div>

        {/* 오류 메시지 표시 */}
        {error && (
          <div
            className='bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl mb-6 shadow-sm animate-shake'
            role='alert'
          >
            <div className='flex items-center'>
              <svg
                className='w-5 h-5 mr-3 text-red-500'
                fill='currentColor'
                viewBox='0 0 20 20'
              >
                <path
                  fillRule='evenodd'
                  d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z'
                  clipRule='evenodd'
                />
              </svg>
              <span className='font-medium'>{error}</span>
            </div>
          </div>
        )}

        {/* 소셜 로그인 섹션 */}
        <div className='mb-8'>
          <div className='flex items-center mb-6'>
            <div className='flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent'></div>
            <span className='px-4 text-sm font-medium text-gray-500 bg-white rounded-full'>
              {t('login_simple_login')}
            </span>
            <div className='flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent'></div>
          </div>

          <SocialLoginButtons
            providers={['google', 'apple', 'kakao', 'wechat']}
            onError={(error) => setError(error.message)}
            size='large'
          />
        </div>

        {/* 하단 안내 */}
        <div className='text-center'>
          <p className='text-gray-600'>{t('login_simple_login_guide')}
          </p>
        </div>

        {/* 장식적 요소들 */}
        <div className='absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-br from-yellow-400 to-pink-400 rounded-full opacity-20 blur-xl animate-bounce'></div>
        <div className='absolute -bottom-6 -left-6 w-16 h-16 bg-gradient-to-br from-green-400 to-blue-400 rounded-full opacity-20 blur-xl animate-pulse'></div>

        {/* 개발 환경에서만 디버그 정보 표시 */}
        {process.env.NODE_ENV === 'development' && (
          <div className='mt-8 p-4 bg-gray-50/80 backdrop-blur-sm rounded-2xl border border-gray-200/50'>
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
    <div className='relative min-h-screen flex flex-col items-center justify-center overflow-hidden py-10 px-4'>
      {/* 동적 배경 그라디언트 */}
      <div className='absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'></div>

      {/* 애니메이션 배경 요소들 */}
      <div className='absolute inset-0 overflow-hidden'>
        <div className='absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob'></div>
        <div
          className='absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-pink-400/20 to-yellow-600/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob'
          style={{ animationDelay: '2s' }}
        ></div>
        <div
          className='absolute top-40 left-40 w-80 h-80 bg-gradient-to-br from-green-400/20 to-blue-600/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob'
          style={{ animationDelay: '4s' }}
        ></div>
      </div>

      {/* 격자 패턴 배경 */}
      <div className='absolute inset-0 opacity-60'>
        <div
          className='absolute inset-0'
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='1.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px',
          }}
        ></div>
      </div>

      {/* 로고 섹션 */}
      <div className='relative z-10 mb-12 transform transition-all duration-700 hover:scale-110'>
        <Link href='/' className='group'>
          <div className='relative'>
            <div className='absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 scale-110'></div>
            <div className='relative bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl border border-white/40 group-hover:shadow-2xl transition-all duration-300'>
              <Image
                src='/images/logo.png'
                alt='Picnic Logo'
                width={60}
                height={60}
                priority
                className='mx-auto filter drop-shadow-lg'
              />
            </div>
          </div>
        </Link>
      </div>

      <div className='relative z-10 w-full max-w-md'>
        <Suspense
          fallback={
            <div className='flex flex-col justify-center items-center min-h-[400px]'>
              <div className='relative'>
                <div className='w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin'></div>
                <div
                  className='absolute inset-0 w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin rotate-45'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
              <p className='text-gray-700 mt-6 font-medium'>
                페이지 로딩 중...
              </p>
              <div className='mt-2 w-32 h-1 bg-gray-200 rounded-full overflow-hidden'>
                <div className='h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-loading-bar'></div>
              </div>
            </div>
          }
        >
          <LoginContentInner />
        </Suspense>
      </div>

      {/* 하단 장식 요소 */}
      <div className='absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white/20 to-transparent backdrop-blur-sm'></div>
    </div>
  );
}

export default function Login() {
  return <LoginContent />;
}
