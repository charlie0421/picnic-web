'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface AuthCallbackClientProps {
  provider?: string;
}

export default function AuthCallbackClient({
  provider,
}: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  
  // 🔧 중복 처리 방지
  const processedRef = useRef(false);

  useEffect(() => {
    // 🚫 중복 처리 방지
    if (processedRef.current) {
      return;
    }
    processedRef.current = true;
    
    console.log('🔍 [AuthCallback] OAuth 콜백 처리 시작');

    const handleOAuthCallback = async () => {
      try {
        // OAuth 코드 확인
        const code = searchParams?.get('code');
        const oauthError = searchParams?.get('error');

        if (oauthError) {
          throw new Error(`OAuth 오류: ${oauthError}`);
        }

        if (!code) {
          throw new Error('OAuth 코드가 없습니다');
        }

        console.log('🔐 [AuthCallback] OAuth 코드 발견:', { code: code.substring(0, 10) + '...' });
        
        console.log('🔧 [OAuth] 서버 API로 토큰 교환 시도 (클라이언트 무한대기 회피)');
        
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
          console.log('✅ [AuthCallback] 서버사이드 OAuth 인증 성공');
          
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
              console.log(`✅ [AuthCallback] 최근 로그인 수단 저장 완료: ${loginProvider}`);
            } catch (error) {
              console.warn('⚠️ [AuthCallback] 최근 로그인 수단 저장 실패:', error);
            }
          }
          
          // 🎯 OAuth 성공 시 강제로 홈페이지 리디렉션 (로그인 페이지 회피)
          localStorage.removeItem('auth_return_url'); // 기존 URL 제거
          const returnUrl = '/ja/vote'; // 강제로 홈페이지 설정

          console.log('🚀 [AuthCallback] OAuth 성공 → 강제 홈페이지 리디렉션:', returnUrl);
          
          // 🔧 강제 새로고침으로 확실한 인증 상태 반영
          console.log('🔄 [AuthCallback] 확실한 인증 상태 반영을 위해 강제 새로고침 실행');
          setTimeout(() => {
            window.location.href = returnUrl;
            // 추가 보험: 1초 후에도 리디렉션 안되면 강제 새로고침
                    setTimeout(() => {
              if (window.location.pathname !== '/ja/vote') {
                console.log('💪 [AuthCallback] 추가 보험: 강제 새로고침');
                window.location.reload();
              }
            }, 1000);
          }, 300); // 더 빠른 리디렉션
          
          return;
        }

        throw new Error(data.error || '서버에서 OAuth 처리 실패');

      } catch (err: any) {
        console.error('❌ [AuthCallback] OAuth 처리 실패:', err);
        
        setError(`로그인 중 문제가 발생했습니다`);

        // 2초 후 로그인 페이지로 리디렉션
              setTimeout(() => {
          console.log('🔄 [AuthCallback] 오류 발생, 로그인 페이지로 리디렉션');
          router.push('/ja/login');
              }, 2000);
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
        {/* 심플한 로딩바 */}
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
