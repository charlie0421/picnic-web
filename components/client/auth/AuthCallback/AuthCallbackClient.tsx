'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface AuthCallbackClientProps {
  provider?: string;
}

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
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [processingStep, setProcessingStep] = useState<string>('인증 정보를 확인하고 있습니다...');
  
  // 🔧 중복 처리 방지
  const processedRef = useRef(false);

  useEffect(() => {
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
        
        // 🔧 OAuth 코드 확인 완료 후 즉시 로딩바 제거
        const immediateLoadingBar = document.getElementById('oauth-loading');
        if (immediateLoadingBar) {
          debugLog('🗑️ [AuthCallback] OAuth 코드 확인 완료, 즉시 로딩바 제거');
          immediateLoadingBar.remove();
        }
        
        setProcessingStep('서버에서 인증을 처리하고 있습니다...');
        debugLog('🔧 [OAuth] 서버 API로 토큰 교환 시도 (클라이언트 무한대기 회피)');
        
        // API 라우트를 통한 서버사이드 처리
        const response = await fetch('/api/auth/exchange-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            provider: provider || 'google',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          setProcessingStep('로그인이 완료되었습니다. 페이지로 이동 중...');
          debugLog('✅ [AuthCallback] 서버사이드 OAuth 인증 성공');
          
          // 성공 정보 저장
          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_success', 'true');
            localStorage.setItem('auth_provider', provider || 'google');
            localStorage.removeItem('code_verifier');
            
            // 🎯 실제 로그인 성공 시 최근 사용한 로그인 수단으로 저장
            try {
              const { saveLastLoginProvider, incrementProviderUsage } = await import('@/utils/auth-helpers');
              const loginProvider = provider || 'google';
              saveLastLoginProvider(loginProvider as any);
              incrementProviderUsage(loginProvider as any);
              debugLog(`✅ [AuthCallback] 최근 로그인 수단 저장 완료: ${loginProvider}`);
            } catch (error) {
              debugError('⚠️ [AuthCallback] 최근 로그인 수단 저장 실패:', error);
            }
          }
          
          // 🎯 OAuth 성공 시 강제로 홈페이지 리디렉션 (로그인 페이지 회피)
          localStorage.removeItem('auth_return_url'); // 기존 URL 제거
          const returnUrl = '/ja/vote'; // 강제로 홈페이지 설정

          debugLog('🚀 [AuthCallback] OAuth 성공 → 강제 홈페이지 리디렉션:', returnUrl);
          
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
              
              // 로딩바가 계속 표시되고 있는지 확인
              const loadingCheck = setInterval(() => {
                if (isProcessing) {
                  debugLog('✅ [AuthCallback] 로딩바 정상 유지 중...');
                }
              }, 100);
              
              // 실제 리디렉션 실행
              setTimeout(() => {
                clearInterval(loadingCheck);
                window.removeEventListener('beforeunload', handleBeforeUnload);
                window.location.href = returnUrl;
              }, 200);
              
              // 추가 보험: 2초 후에도 리다이렉션 안되면 강제 새로고침
              setTimeout(() => {
                if (window.location.pathname !== '/ja/vote') {
                  debugLog('💪 [AuthCallback] 추가 보험: 강제 새로고침');
                  clearInterval(loadingCheck);
                  window.removeEventListener('beforeunload', handleBeforeUnload);
                  window.location.reload();
                }
              }, 2000); // 2초로 늘림
            }, 1000); // 300ms → 1000ms로 늘림
          });
          
          return;
        }

        throw new Error(data.error || '서버에서 OAuth 처리 실패');

      } catch (err: any) {
        debugError('❌ [AuthCallback] OAuth 처리 실패:', err);
        
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
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        {/* 심플한 로딩바만 표시 - 텍스트 제거 */}
        <div className="relative">
          {/* 외부 원 */}
          <div className="w-20 h-20 border-4 border-gray-200 rounded-full"></div>
          {/* 회전하는 로딩바 */}
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        
        {/* 간단한 점 애니메이션 */}
        <div className="flex justify-center items-center mt-6 space-x-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
        </div>
      </div>
    </div>
  );
}
