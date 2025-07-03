'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { AuthCallbackSkeleton } from '@/components/server';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { getSocialAuthService } from '@/lib/supabase/social';

interface AuthCallbackClientProps {
  provider?: string;
}

// OAuth 콜백 전용 간단한 Supabase 클라이언트 (Realtime 비활성화)
function createSimpleOAuthClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        autoRefreshToken: false, // OAuth 콜백에서는 불필요
        persistSession: true,
        debug: process.env.NODE_ENV === 'development'
      }
      // Realtime 완전히 제거 - OAuth 콜백에서는 불필요
    }
  );
}

export default function AuthCallbackClient({
  provider,
}: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('OAuth 콜백 처리 중...');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 수동 콜백 처리 함수를 먼저 정의
  const handleManualCallback = useCallback(async () => {
    console.log('🔥 [AuthCallback] handleManualCallback 함수 시작');
    
    try {
      console.log('🔥 [AuthCallback] try 블록 진입');
      
      // provider 자동 감지 로직
      let detectedProvider = provider;
      console.log('🔥 [AuthCallback] provider 감지 시작:', { provider, detectedProvider });
      
      if (!detectedProvider) {
        console.log('🔥 [AuthCallback] provider가 없어서 자동 감지 시도');
        // URL에서 provider 감지 시도
        const codeParam = searchParams.get('code');
        const stateParam = searchParams.get('state');
        
        console.log('🔥 [AuthCallback] URL 파라미터 확인:', { codeParam, stateParam });
        
        // WeChat OAuth의 특징적인 파라미터들을 확인
        if (stateParam?.includes('wechat')) {
          detectedProvider = 'wechat';
          console.log('🔍 Provider 자동 감지: WeChat (state 파라미터에서 감지)');
        }
        // Apple OAuth의 특징적인 파라미터들을 확인
        else if (codeParam) {
          // Apple OAuth는 보통 code 파라미터가 있음
          detectedProvider = 'apple';
          console.log('🔍 Provider 자동 감지: Apple (code 파라미터 존재)');
        }
      }
      
      console.log('🔥 [AuthCallback] 최종 detectedProvider:', detectedProvider);
      
      if (!detectedProvider) {
        console.log('🔥 [AuthCallback] provider 감지 실패');
        setIsLoading(false);
        setError('OAuth provider를 감지할 수 없습니다.');
        return;
      }
      
      const providerType = detectedProvider as SocialLoginProvider;
      console.log(`🔍 [AuthCallback] ${providerType} 콜백 처리 시작:`, {
        url: typeof window !== 'undefined' ? window.location.href : 'SSR',
        params: Object.fromEntries(searchParams.entries()),
        provider: providerType
      });

      console.log('🔥 [AuthCallback] OAuth 클라이언트 생성 시도...');
      
      // 환경변수 확인
      console.log('🔥 [AuthCallback] 환경변수 확인:', {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
      });

      // OAuth 콜백 직접 처리 - 복잡한 서비스 레이어 우회
      let oauthClient;
      try {
        console.log('🔥 [AuthCallback] createSimpleOAuthClient() 호출...');
        oauthClient = createSimpleOAuthClient();
        console.log(`🔍 [AuthCallback] OAuth 클라이언트 생성 완료`);
      } catch (clientError) {
        console.error('💥 [AuthCallback] OAuth 클라이언트 생성 실패:', clientError);
        throw new Error(`OAuth 클라이언트 생성 실패: ${clientError instanceof Error ? clientError.message : '알 수 없는 오류'}`);
      }
      
      console.log(`🔍 [AuthCallback] ${providerType} 직접 콜백 처리 시작`);
      
      // 간단한 세션 확인 방식
      console.log(`🔄 [AuthCallback] ${providerType} getSession() 호출 시작...`);
      
      let sessionData, sessionError;
      try {
        console.log('🔥 [AuthCallback] getSession() 실제 호출...');
        const result = await oauthClient.auth.getSession();
        sessionData = result.data;
        sessionError = result.error;
        console.log('🔥 [AuthCallback] getSession() 완료');
      } catch (getSessionError) {
        console.error('💥 [AuthCallback] getSession() 예외 발생:', getSessionError);
        sessionError = getSessionError;
      }
      
      console.log(`📨 [AuthCallback] ${providerType} getSession() 응답:`, {
        hasData: !!sessionData,
        hasSession: !!sessionData?.session,
        hasError: !!sessionError,
        errorMessage: sessionError?.message,
        sessionUser: sessionData?.session?.user?.email
      });
      
      if (sessionError) {
        console.error('💥 [AuthCallback] 세션 확인 오류:', sessionError);
        throw new Error(`세션 확인 실패: ${sessionError.message}`);
      }
      
      if (!sessionData.session) {
        console.error('💥 [AuthCallback] 세션이 생성되지 않음 - Supabase OAuth 설정 확인 필요');
        
        // 추가 디버깅 정보
        console.log('🔍 [AuthCallback] 디버깅 정보:', {
          currentUrl: window.location.href,
          searchParams: Object.fromEntries(new URLSearchParams(window.location.search)),
          hashParams: Object.fromEntries(new URLSearchParams(window.location.hash.substring(1))),
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        });
        
        throw new Error('OAuth 인증 후 세션이 생성되지 않았습니다. Google OAuth 설정이나 Supabase 설정을 확인해주세요.');
      }
      
      console.log('✅ [AuthCallback] OAuth 세션 확인 성공:', {
        userId: sessionData.session.user.id,
        email: sessionData.session.user.email,
        provider: sessionData.session.user.app_metadata?.provider
      });
      
      const result = {
        success: true,
        session: sessionData.session,
        user: sessionData.session.user,
        provider: providerType,
        message: `${providerType} 로그인 성공`,
      };
      
      if (result.success) {
        setStatus('');
        
        // 성공 후 리디렉션
        const returnUrl = typeof window !== 'undefined' && localStorage ? 
          (localStorage.getItem('auth_return_url') || '/') : '/';
        
        if (typeof window !== 'undefined' && localStorage) {
          localStorage.setItem("auth_success", "true");
          localStorage.setItem("auth_provider", providerType);
          localStorage.setItem("auth_timestamp", Date.now().toString());
          localStorage.removeItem('auth_return_url');
        }
        
        console.log('🚀 [AuthCallback] 리다이렉트 실행:', returnUrl);
        window.location.href = returnUrl;
      } else {
        setIsLoading(false);
        setError(result.error || `${providerType} 인증 실패`);
      }
      
    } catch (error) {
      console.error('💥 [AuthCallback] 수동 처리 오류:', error);
      setIsLoading(false);
      setError(`인증 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }, [provider, searchParams]);



  useEffect(() => {
    // 브라우저 환경에서만 실행
    if (typeof window === 'undefined') return;

    // 로딩 화면 제거
    const loadingEl = document.getElementById('oauth-loading');
    if (loadingEl) {
      loadingEl.remove();
    }

    const handleCallback = async () => {
      try {
        console.log('🚀 [AuthCallback] 메인 콜백 처리 시작');
        console.log('🔍 [AuthCallback] 현재 URL:', window.location.href);
        console.log('🔍 [AuthCallback] Provider:', provider || 'auto-detect');
        console.log('🔍 [AuthCallback] Search Params:', Object.fromEntries(searchParams.entries()));
        
        // Supabase 자체 OAuth 콜백 처리 먼저 시도
        console.log('🔍 [AuthCallback] Supabase 자체 OAuth 콜백 처리 시작');
        
        // Supabase 클라이언트 사용 (이미 import됨)

        // URL에 OAuth 파라미터가 있는지 확인
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        const hasOAuthParams = !!(
          urlParams.get('code') || 
          urlParams.get('access_token') || 
          hashParams.get('access_token') ||
          urlParams.get('error')
        );

        if (hasOAuthParams) {
          console.log('🔍 [AuthCallback] OAuth 파라미터 감지, Supabase 자동 처리 시도');
          
          try {
            // Supabase의 자동 세션 복구 시도 - 타임아웃 추가
            console.log('🔄 [AuthCallback] getSession() 호출 시작...');
            
            let sessionData: any = null;
            let sessionError: any = null;
            let timedOut = false;
            
            try {
              const result = await Promise.race([
                createSimpleOAuthClient().auth.getSession(),
                new Promise((_, reject) => 
                  setTimeout(() => {
                    timedOut = true;
                    reject(new Error('getSession() 5초 타임아웃')); // 10초에서 5초로 단축 - 간단한 클라이언트는 더 빨라야 함
                  }, 5000) // 타임아웃도 5초로 단축
                )
              ]);
              
              sessionData = (result as any).data;
              sessionError = (result as any).error;
              
            } catch (timeoutError: any) {
              if (timedOut) {
                console.warn('⏰ [AuthCallback] getSession() 타임아웃, 수동 처리로 전환');
                handleManualCallback();
                return;
              }
              sessionError = timeoutError;
            }
            
            console.log('📨 [AuthCallback] getSession() 응답:', {
              hasData: !!sessionData,
              hasSession: !!sessionData?.session,
              hasError: !!sessionError,
              timedOut
            });
            
            if (!sessionError && sessionData?.session) {
              console.log('✅ [AuthCallback] Supabase 자동 처리로 세션 복구 성공');
              
              // 서버 사이드 쿠키 동기화 강제 실행
              try {
                console.log('🔄 [AuthCallback] 서버 사이드 쿠키 동기화 시도');
                const syncResponse = await fetch('/api/auth/verify', {
                  method: 'GET',
                  credentials: 'include',
                });
                
                if (syncResponse.ok) {
                  console.log('✅ [AuthCallback] 서버 사이드 쿠키 동기화 성공');
                } else {
                  console.warn('⚠️ [AuthCallback] 서버 사이드 쿠키 동기화 실패, 하지만 진행');
                }
              } catch (syncError) {
                console.warn('⚠️ [AuthCallback] 쿠키 동기화 오류, 하지만 진행:', syncError);
              }
              
              setStatus('');
              
              // 저장된 리다이렉트 URL로 이동
              const returnUrl = typeof window !== 'undefined' && localStorage ? 
                (localStorage.getItem('auth_return_url') || '/') : '/';
              
              if (typeof window !== 'undefined' && localStorage) {
                localStorage.setItem("auth_success", "true");
                localStorage.setItem("auth_provider", provider || 'google');
                localStorage.setItem("auth_timestamp", Date.now().toString());
                localStorage.removeItem('auth_return_url');
              }
              
              // 즉시 리다이렉트
              console.log('🚀 [AuthCallback] 즉시 리다이렉트 실행:', returnUrl);
              window.location.href = returnUrl;
              return; // 성공했으므로 더 이상 진행하지 않음
            }
            
            // 세션이 없다면 OAuth 이벤트 리스너 등록 후 대기
            console.log('🔄 [AuthCallback] 세션이 없음, OAuth 이벤트 대기 중...');
            
            let authEventHandled = false;
            const authTimeout = setTimeout(() => {
              if (!authEventHandled) {
                console.log('⏰ [AuthCallback] OAuth 이벤트 타임아웃, 수동 처리로 전환');
                handleManualCallback();
              }
            }, 3000); // 5초에서 3초로 단축 - 간단한 클라이언트는 더 빨라야 함

            // OAuth 상태 변경 이벤트 리스너
            const { data: authListener } = createSimpleOAuthClient().auth.onAuthStateChange((event, session) => {
              console.log('🔔 [AuthCallback] Auth 상태 변경:', { event, hasSession: !!session });
              
              if (event === 'SIGNED_IN' && session && !authEventHandled) {
                authEventHandled = true;
                clearTimeout(authTimeout);
                
                console.log('✅ [AuthCallback] OAuth 이벤트로 로그인 성공');
                
                // 성공 처리
                const returnUrl = typeof window !== 'undefined' && localStorage ? 
                  (localStorage.getItem('auth_return_url') || '/') : '/';
                
                // localStorage 정리
                if (typeof window !== 'undefined' && localStorage) {
                  localStorage.setItem("auth_success", "true");
                  localStorage.setItem("auth_provider", provider || 'google');
                  localStorage.setItem("auth_timestamp", Date.now().toString());
                  localStorage.removeItem('auth_return_url');
                }
                
                setStatus('');
                
                // 리스너 정리
                authListener.subscription.unsubscribe();
                
                window.location.href = returnUrl;
                return;
              }
              
              if (event === 'SIGNED_OUT' && !authEventHandled) {
                authEventHandled = true;
                clearTimeout(authTimeout);
                console.warn('❌ [AuthCallback] OAuth 이벤트로 로그아웃 감지');
                
                // 리스너 정리
                authListener.subscription.unsubscribe();
                
                handleManualCallback();
              }
            });

            // 컴포넌트 언마운트 시 리스너 정리
            return () => {
              if (authListener?.subscription) {
                authListener.subscription.unsubscribe();
              }
              clearTimeout(authTimeout);
            };
            
          } catch (supabaseError) {
            console.warn('⚠️ [AuthCallback] Supabase 자동 처리 실패:', supabaseError);
            handleManualCallback();
          }
        } else {
          console.log('🔍 [AuthCallback] OAuth 파라미터 없음, 수동 처리 시작');
          handleManualCallback();
        }
        
      } catch (error) {
        console.error('💥 [AuthCallback] 초기 처리 오류:', error);
        handleManualCallback();
      }
    };

    handleCallback();
  }, [provider, searchParams, handleManualCallback]);

  const handleRetry = () => {
    const returnUrl = typeof window !== 'undefined' && localStorage ? 
      (localStorage.getItem('auth_return_url') || '/') : '/';
    window.location.href = returnUrl;
  };

  // 에러 시에만 표시, 그 외에는 빈 화면 (로딩은 페이지 레벨에서 처리)
  if (error) {
    return <AuthCallbackSkeleton error={error} onRetry={handleRetry} />;
  }

  // 처리 중일 때는 아무것도 렌더링하지 않음 (페이지 레벨 로딩 사용)
  return null;
}
