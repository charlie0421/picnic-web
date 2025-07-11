'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { handlePostLoginRedirect } from '@/utils/auth-redirect';

interface AuthCallbackClientProps {
  provider?: string;
}

// GlobalLoadingContext를 안전하게 사용하는 훅
const useSafeGlobalLoading = () => {
  try {
    // 동적 import로 안전하게 사용
    const { useGlobalLoading } = require('@/contexts/GlobalLoadingContext');
    return useGlobalLoading();
  } catch (error) {
    // GlobalLoadingProvider가 없는 경우 빈 함수 반환
    console.warn('GlobalLoadingProvider가 제공되지 않았습니다. 대체 구현을 사용합니다.');
    return {
      setIsLoading: (loading: boolean) => {
        console.log('GlobalLoading 상태:', loading);
      }
    };
  }
};

// 개발 환경에서만 로그 출력
const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, data || '');
  }
};

const debugError = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(message, data || '');
  }
};

export default function AuthCallbackClient({
  provider,
}: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setIsLoading } = useSafeGlobalLoading();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [processingStep, setProcessingStep] = useState<string>('인증 정보를 확인하고 있습니다...');
  
  // 🔧 중복 처리 방지
  const processedRef = useRef(false);

  useEffect(() => {
    // 🚀 전역 로딩바 시작
    setIsLoading(true);
    debugLog('🔄 [AuthCallback] 전역 로딩바 시작');
    
    // 🗑️ 즉시 로딩바 제거 (전역 로딩바로 대체)
    setTimeout(() => {
      const immediateLoadingBar = document.getElementById('oauth-loading');
      if (immediateLoadingBar) {
        debugLog('🗑️ [AuthCallback] 즉시 로딩바 제거 (전역 로딩바로 대체)');
        immediateLoadingBar.remove();
      }
    }, 100);
    
    // 🔧 최소 로딩 시간 보장 (사용자가 로딩 상태를 인지할 수 있도록)
    const minimumLoadingTime = 1200; // 800ms → 1200ms로 늘림 (더 확실한 로딩 경험)
    const startTime = Date.now();

    const ensureMinimumLoading = async (callback: () => void) => {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minimumLoadingTime - elapsed);
      
      if (remainingTime > 0) {
        debugLog(`🔄 [AuthCallback] 최소 로딩 시간 보장: ${remainingTime}ms 대기`);
        setTimeout(callback, remainingTime);
      } else {
        callback();
      }
    };

    // 🔧 즉시 로딩바 제거를 지연시키고 OAuth 처리 상태 표시
    // 즉시 제거하지 말고 OAuth 처리가 시작될 때 제거하도록 수정
    // setTimeout(() => {
    //   const immediateLoadingBar = document.getElementById('oauth-loading');
    //   if (immediateLoadingBar) {
    //     debugLog('🗑️ [AuthCallback] 즉시 로딩바 제거 (최소 시간 후)');
    //     immediateLoadingBar.remove();
    //   }
    // }, 200); // 200ms 후에 즉시 로딩바 제거

    // 🚫 중복 처리 방지
    if (processedRef.current) {
      return;
    }
    processedRef.current = true;
    
    debugLog('🔍 [AuthCallback] OAuth 콜백 처리 시작');

    const handleOAuthCallback = async () => {
      try {
        setProcessingStep('OAuth 코드를 확인하고 있습니다...');
        
        // OAuth 코드 확인
        const code = searchParams?.get('code');
        const oauthError = searchParams?.get('error');

        if (oauthError) {
          throw new Error(`OAuth 오류: ${oauthError}`);
        }

        if (!code) {
          throw new Error('OAuth 코드가 없습니다');
        }

        debugLog('🔐 [AuthCallback] OAuth 코드 발견:', { code: code.substring(0, 10) + '...' });
        
        // Apple 특화 파라미터 수집
        let appleParams: Record<string, string> = {};
        if (provider === 'apple') {
          const user = searchParams?.get('user');
          const idToken = searchParams?.get('id_token');
          const state = searchParams?.get('state');
          
          if (user) appleParams.user = user;
          if (idToken) appleParams.id_token = idToken;
          if (state) appleParams.state = state;
          
          debugLog('🍎 [AuthCallback] Apple 특화 파라미터 수집:', {
            hasUser: !!user,
            hasIdToken: !!idToken,
            hasState: !!state
          });
        }
        
        setProcessingStep('서버에서 인증을 처리하고 있습니다...');
        debugLog('🔧 [OAuth] 서버 API로 토큰 교환 시도 (클라이언트 무한대기 회피)');
        
        // API 라우트를 통한 서버사이드 처리 (모든 환경 동일)
        const apiUrl = '/api/auth/exchange-code';
        
        debugLog('🔗 [AuthCallback] API URL 설정:', { 
          apiUrl,
          currentHost: window.location.hostname 
        });
        
        // 🔧 API 호출에 타임아웃 설정 (15초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            provider: provider || 'google',
            ...appleParams, // Apple 특화 파라미터 포함
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          setProcessingStep('인증이 완료되었습니다. 쿠키를 동기화하고 있습니다...');
          debugLog('✅ [AuthCallback] 서버사이드 OAuth 인증 성공');
          
          // 🔧 쿠키 동기화와 성공 처리를 병렬로 실행
          const [syncResult] = await Promise.allSettled([
            // 쿠키 동기화 (타임아웃 5초)
            fetch('/api/auth/verify', {
              method: 'GET',
              credentials: 'include',
              signal: AbortSignal.timeout(5000),
            }),
            // 성공 정보 저장 (즉시 완료)
            Promise.resolve().then(() => {
              if (typeof window !== 'undefined') {
                localStorage.setItem('auth_success', 'true');
                localStorage.setItem('auth_provider', provider || 'google');
                localStorage.removeItem('code_verifier');
                
                // 🎯 최근 로그인 정보는 AuthStore에서 API를 통해 자동으로 처리됩니다
                // (중복 처리 방지를 위해 여기서는 제거됨)
                debugLog('ℹ️ [AuthCallback] 최근 로그인 정보는 AuthStore에서 자동 처리됩니다');
              }
            })
          ]);
          
          // 동기화 결과 로깅 (실패해도 진행)
          if (syncResult.status === 'fulfilled') {
            debugLog('✅ [AuthCallback] 쿠키 동기화 성공');
          } else {
            debugLog('⚠️ [AuthCallback] 쿠키 동기화 실패, 하지만 진행:', syncResult.reason);
          }
          
          setProcessingStep('로그인이 완료되었습니다. 페이지로 이동 중...');
          
          // 🚀 즉시 로딩바 제거하지 않고 리다이렉션까지 유지
          debugLog('✅ [AuthCallback] OAuth 처리 완료, 리다이렉션까지 로딩바 유지');
          
          // 🎯 OAuth 성공 시 적절한 페이지로 리디렉션
          localStorage.removeItem('auth_return_url'); // 기존 URL 제거
          
          // returnTo 파라미터 확인 및 적절한 리다이렉션 URL 결정
          const returnTo = searchParams?.get('returnTo');
          const returnUrl = handlePostLoginRedirect(returnTo || undefined);

          debugLog('🚀 [AuthCallback] OAuth 성공 → 리디렉션:', { returnTo, returnUrl });
          
          // 🔧 최소 로딩 시간 보장 후 리디렉션
          ensureMinimumLoading(() => {
            debugLog('🔄 [AuthCallback] 확실한 인증 상태 반영을 위해 강제 새로고침 실행');
            // 성공 시에는 로딩 상태 유지 (리다이렉션 완료까지)
            // setIsProcessing(false); // 제거: 성공 시에는 로딩바 유지
            
            // 리디렉션 지연 시간을 늘려서 사용자가 로딩바를 충분히 볼 수 있도록 함
            setTimeout(() => {
              debugLog('🚀 [AuthCallback] 로딩바 유지하면서 리디렉션 실행');
              // 리디렉션 직전까지 로딩바 유지
              
              // 페이지 언로드가 시작될 때까지 로딩 상태 확실히 유지
              const handleBeforeUnload = () => {
                debugLog('📤 [AuthCallback] 페이지 언로드 시작 - 로딩바 유지됨');
              };
              
              window.addEventListener('beforeunload', handleBeforeUnload);
              
              // 🎯 리다이렉션 직전에 로딩바 상태 확인 (너무 자주 체크하지 않음)
              debugLog('🚀 [AuthCallback] 리다이렉션 준비 완료, 로딩바 계속 유지');
              
              // 실제 리디렉션 실행
              setTimeout(() => {
                window.removeEventListener('beforeunload', handleBeforeUnload);
                debugLog('🚀 [AuthCallback] 로딩바 유지하면서 리다이렉션 실행');
                window.location.href = returnUrl;
              }, 200);
              
              // 추가 보험: 2초 후에도 리다이렉션 안되면 강제 새로고침
              setTimeout(() => {
                const expectedPath = new URL(returnUrl, window.location.origin).pathname;
                if (window.location.pathname !== expectedPath) {
                  debugLog('💪 [AuthCallback] 추가 보험: 강제 새로고침');
                  window.removeEventListener('beforeunload', handleBeforeUnload);
                  window.location.reload();
                }
              }, 2000);
            }, 500); // 500ms로 줄여서 더 빠른 전환
          });
          
          return;
        }

        throw new Error(data.error || '서버에서 OAuth 처리 실패');

      } catch (err: any) {
        debugError('❌ [AuthCallback] OAuth 처리 실패:', err);
        
        // 🔧 에러 시에도 전역 로딩바 해제
        setIsLoading(false);
        debugLog('🗑️ [AuthCallback] 에러 발생, 전역 로딩바 해제');
        
        // 즉시 로딩바도 제거 (혹시 남아있다면)
        const immediateLoadingBar = document.getElementById('oauth-loading');
        if (immediateLoadingBar) {
          immediateLoadingBar.remove();
        }
        
        ensureMinimumLoading(() => {
          setError(`로그인 중 문제가 발생했습니다`);
          setIsProcessing(false);

          // 2초 후 로그인 페이지로 리디렉션
          setTimeout(() => {
            debugLog('🔄 [AuthCallback] 오류 발생, 로그인 페이지로 리디렉션');
            router.push('/ja/login');
          }, 2000);
        });
      }
    };

    handleOAuthCallback();
  }, []); // 빈 의존성 배열

  // UI 렌더링
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">로그인 실패</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">잠시 후 로그인 페이지로 이동합니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        {/* 로고 아이콘 with 펄스 애니메이션 */}
        <div className="relative">
          <Image
            src="/images/logo.png"
            alt="Picnic Loading"
            width={80}
            height={80}
            priority
            className="w-20 h-20 rounded-full animate-pulse drop-shadow-lg object-cover"
          />
        </div>
        
        {/* 로딩 텍스트 */}
        <div className="mt-6 text-gray-600 text-sm font-medium animate-pulse">
          {processingStep}
        </div>
      </div>
    </div>
  );
}
