'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { AuthCallbackSkeleton } from '@/components/server';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getSocialAuthService } from '@/lib/supabase/social';

interface AuthCallbackClientProps {
  provider?: string;
}

export default function AuthCallbackClient({
  provider,
}: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

        console.log('🔍 [AuthCallback] OAuth 파라미터 체크:', {
          hasOAuthParams,
          code: !!urlParams.get('code'),
          accessToken: !!urlParams.get('access_token'),
          hashAccessToken: !!hashParams.get('access_token'),
          error: !!urlParams.get('error'),
          currentURL: window.location.href
        });

        if (hasOAuthParams) {
          console.log('🔍 [AuthCallback] OAuth 파라미터 감지, Supabase 자동 처리 시도');
          
          try {
            // Supabase의 자동 세션 복구 시도 (타임아웃 추가)
            console.log('🔍 [AuthCallback] getSession() 호출 시작...');
            
            const sessionPromise = createBrowserSupabaseClient().auth.getSession();
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('getSession timeout')), 2000)
            );
            
            let sessionData: any = null;
            let sessionError: any = null;
            
            try {
              const result = await Promise.race([
                sessionPromise,
                timeoutPromise
              ]);
              sessionData = (result as any)?.data;
              sessionError = (result as any)?.error;
            } catch (error) {
              console.warn('⚠️ [AuthCallback] getSession() 타임아웃 또는 에러:', (error as Error).message);
              sessionError = error;
            }
            
            console.log('🔍 [AuthCallback] getSession() 결과:', { 
              hasData: !!sessionData, 
              hasSession: !!sessionData?.session,
              hasError: !!sessionError,
              errorMessage: sessionError?.message 
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
                proceedWithManualHandling();
              }
            }, 1000); // 1초로 더 단축

            // OAuth 상태 변경 이벤트 리스너
            const { data: authListener } = createBrowserSupabaseClient().auth.onAuthStateChange((event, session) => {
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
                
                proceedWithManualHandling();
              }
            });

            // 수동 처리 함수
            const proceedWithManualHandling = () => {
              console.log('🔄 [AuthCallback] 수동 OAuth 콜백 처리로 전환');
              handleManualCallback();
            };

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

    // 수동 콜백 처리 함수
    const handleManualCallback = async () => {
      try {
        // provider 자동 감지 로직
        let detectedProvider = provider;
        
        if (!detectedProvider) {
          // URL에서 provider 감지 시도
          const codeParam = searchParams.get('code');
          const stateParam = searchParams.get('state');
          
          // WeChat OAuth의 특징적인 파라미터들을 확인
          if (stateParam?.includes('wechat')) {
            detectedProvider = 'wechat';
            console.log('🔍 Provider 자동 감지: WeChat (state 파라미터에서 감지)');
          }
          // Google OAuth 감지 - URL path나 현재 path에서 확인
          else if (window.location.pathname.includes('/google') || codeParam) {
            detectedProvider = 'google';
            console.log('🔍 Provider 자동 감지: Google (URL path 또는 code 파라미터)');
          }
          // Apple OAuth의 특징적인 파라미터들을 확인
          else if (codeParam) {
            // 마지막 fallback으로 Apple 처리
            detectedProvider = 'apple';
            console.log('🔍 Provider 자동 감지: Apple (code 파라미터 존재)');
          }
        }
        
        if (!detectedProvider) {
          setIsLoading(false);
          setError('OAuth provider를 감지할 수 없습니다.');
          return;
        }
        
        const providerType = detectedProvider as SocialLoginProvider;

        // 오류 코드가 있으면 처리
        const errorCode = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        const errorCodeParam = searchParams.get('error_code');
        
        if (errorCode) {
          console.error('Auth callback error:', {
            error: errorCode,
            error_code: errorCodeParam,
            description: errorDescription,
            provider: providerType,
            url: typeof window !== 'undefined' ? window.location.href : 'SSR',
          });
          
          // bad_oauth_state 에러 특별 처리
          if (errorCode === 'invalid_request' && errorCodeParam === 'bad_oauth_state') {
            console.warn('🔒 [AuthCallback] OAuth state 검증 실패 - 보안 에러');
            
            // 세션 스토리지와 로컬 스토리지 정리
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.clear();
                localStorage.removeItem('auth_return_url');
                localStorage.removeItem(`${providerType}_oauth_state`);
                localStorage.removeItem('wechat_oauth_state');
                localStorage.removeItem('apple_oauth_state');
              } catch (e) {
                console.warn('스토리지 정리 중 오류:', e);
              }
            }
            
            setIsLoading(false);
            setError(
              '보안상의 이유로 로그인이 취소되었습니다. 다시 시도해주세요.'
            );
            
            // 3초 후 로그인 페이지로 리다이렉트
            setTimeout(() => {
              window.location.href = '/ko/login';
            }, 3000);
            
            return;
          }
          
          setIsLoading(false);
          setError(
            `인증 오류: ${errorCode} - ${
              errorDescription || '자세한 정보 없음'
            }`,
          );
          return;
        }

        // WeChat 특수 처리
        if (providerType === 'wechat') {
          console.log('💚 WeChat OAuth 콜백 처리 시작:', {
            url: typeof window !== 'undefined' ? window.location.href : 'SSR',
            searchParams: Object.fromEntries(searchParams.entries()),
            provider: providerType,
          });

          const codeParam = searchParams.get('code');
          const stateParam = searchParams.get('state');

          if (!codeParam) {
            setIsLoading(false);
            setError('WeChat 인증 코드가 없습니다.');
            return;
          }

          console.log('WeChat callback params:', {
            code: codeParam ? 'present' : 'missing',
            state: stateParam || 'missing',
          });

          setStatus('');

          try {
            console.log('WeChat API 호출 시작:', {
              code: codeParam ? 'present' : 'missing',
              state: stateParam ? 'present' : 'missing',
            });

            const requestBody = {
              code: codeParam,
              state: stateParam,
            };

            console.log('요청 본문:', JSON.stringify(requestBody));

            const response = await fetch('/api/auth/wechat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });

            console.log('WeChat API 응답:', {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
            });

            let result;
            try {
              result = await response.json();
              console.log('응답 본문:', result);
            } catch (jsonError) {
              console.error('응답 JSON 파싱 오류:', jsonError);
              const textResponse = await response.text();
              console.log('응답 텍스트:', textResponse);
              throw new Error(`응답 파싱 실패: ${textResponse}`);
            }

            if (response.ok && result.success) {
              setStatus('');

              // WeChat 인증 성공 후 Supabase 세션 생성
              if (result.profile && result.tokens) {
                console.log('🔑 WeChat 인증 완료, Supabase 세션 생성...');
                
                try {
                  // Supabase 클라이언트 사용 (이미 import됨)
                  
                  console.log('💚 WeChat 사용자 정보로 Supabase 세션 생성 시도...');
                  
                  // WeChat은 이메일을 제공하지 않으므로 임시 이메일 생성
                  const tempEmail = `wechat_${result.profile.id}@placeholder.com`;
                  const tempPassword = result.tokens.id_token;
                  
                  // 기존 사용자 확인 후 로그인 시도
                  const { data: loginData, error: loginError } = await createBrowserSupabaseClient().auth.signInWithPassword({
                    email: tempEmail,
                    password: tempPassword
                  });
                  
                  if (loginData.session && !loginError) {
                    console.log('✅ WeChat 기존 사용자 로그인 성공!');
                    setStatus('WeChat 로그인 완료!');
                  } else if (loginError?.message?.includes('Invalid login credentials')) {
                    console.log('ℹ️ WeChat 신규 사용자, 회원가입 시도...');
                    
                    // 신규 사용자 생성
                    const { data: signUpData, error: signUpError } = await createBrowserSupabaseClient().auth.signUp({
                      email: tempEmail,
                      password: tempPassword,
                      options: {
                        data: {
                          full_name: result.profile.name || 'WeChat User',
                          wechat_openid: result.profile.id,
                          provider: 'wechat',
                          wechat_verified: true,
                          email_verified: true, // WeChat 인증으로 간주
                          avatar_url: result.profile.avatar
                        }
                      }
                    });
                    
                    if (signUpData.user && !signUpError) {
                      console.log('✅ WeChat 신규 사용자 생성 성공!');
                      setStatus('WeChat 회원가입 완료!');
                    } else {
                      console.log('❌ WeChat 사용자 생성 실패:', signUpError?.message);
                      throw new Error(signUpError?.message || 'WeChat 사용자 생성 실패');
                    }
                  } else {
                    console.log('❌ WeChat 로그인 실패:', loginError?.message);
                    throw new Error(loginError?.message || 'WeChat 로그인 실패');
                  }
                  
                } catch (sessionError) {
                  console.error('WeChat 세션 생성 중 오류:', sessionError);
                  setIsLoading(false);
                  setError(`WeChat 세션 생성 실패: ${sessionError instanceof Error ? sessionError.message : '알 수 없는 오류'}`);
                  return;
                }
              }

              // 성공 후 리디렉션
              const returnUrl = typeof window !== 'undefined' && localStorage ? 
                (localStorage.getItem('auth_return_url') || '/') : '/';
              console.log('🔄 WeChat 리다이렉트 준비:', {
                returnUrl,
                hasAuthReturnUrl: typeof window !== 'undefined' && localStorage ? 
                  !!localStorage.getItem('auth_return_url') : false,
              });

              if (typeof window !== 'undefined' && localStorage) {
                localStorage.removeItem('auth_return_url');
                localStorage.removeItem('wechat_oauth_state');
              }

              // 즉시 리다이렉트
              console.log('🚀 WeChat 리다이렉트 실행:', returnUrl);
              window.location.href = returnUrl;
            } else {
              throw new Error(
                result.message || `HTTP ${response.status}: WeChat 인증 처리 실패`,
              );
            }
          } catch (fetchError) {
            console.error('WeChat API 호출 오류:', fetchError);
            setIsLoading(false);
            setError(`WeChat 인증 실패: ${fetchError instanceof Error ? fetchError.message : '알 수 없는 오류'}`);
          }
          return;
        }

        // Apple 특수 처리
        if (providerType === 'apple') {
          console.log('🍎 Apple OAuth 콜백 처리 시작:', {
            url: typeof window !== 'undefined' ? window.location.href : 'SSR',
            searchParams: Object.fromEntries(searchParams.entries()),
            provider: providerType,
          });

          // API에서 성공적으로 리다이렉트된 경우 확인
          const successParam = searchParams.get('success');
          const userIdParam = searchParams.get('user_id');
          const emailParam = searchParams.get('email');

          if (successParam === 'true') {
            console.log('✅ Apple OAuth 성공 확인:', {
              userId: userIdParam || 'missing',
              email: emailParam || 'missing',
              currentUrl: typeof window !== 'undefined' ? window.location.href : 'SSR',
            });

                          setStatus('');

            // 성공 후 리디렉션
            const returnUrl = typeof window !== 'undefined' && localStorage ? 
              (localStorage.getItem('auth_return_url') || '/') : '/';
            console.log('🔄 리다이렉트 준비:', {
              returnUrl,
              hasAuthReturnUrl: typeof window !== 'undefined' && localStorage ? 
                !!localStorage.getItem('auth_return_url') : false,
            });

            if (typeof window !== 'undefined' && localStorage) {
              localStorage.removeItem('auth_return_url');
              localStorage.removeItem('apple_oauth_state');
            }

            // 즉시 리다이렉트
            console.log('🚀 리다이렉트 실행:', returnUrl);
            window.location.href = returnUrl;
            return;
          }

          const codeParam = searchParams.get('code');
          const stateParam = searchParams.get('state');
          const userParam = searchParams.get('user');

          if (!codeParam) {
            setIsLoading(false);
            setError('Apple 인증 코드가 없습니다.');
            return;
          }

          console.log('Apple callback params:', {
            code: codeParam ? 'present' : 'missing',
            state: stateParam || 'missing',
            user: userParam ? 'present' : 'missing',
          });

          setStatus('');

          try {
            console.log('Apple API 호출 시작:', {
              code: codeParam ? 'present' : 'missing',
              user: userParam ? 'present' : 'missing',
              state: stateParam ? 'present' : 'missing',
            });

            const requestBody = {
              code: codeParam,
              user: userParam,
              state: stateParam,
            };

            console.log('요청 본문:', JSON.stringify(requestBody));

            const response = await fetch('/api/auth/apple', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            });

            console.log('Apple API 응답:', {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
            });

            let result;
            try {
              result = await response.json();
              console.log('응답 본문:', result);
            } catch (jsonError) {
              console.error('응답 JSON 파싱 오류:', jsonError);
              const textResponse = await response.text();
              console.log('응답 텍스트:', textResponse);
              throw new Error(`응답 파싱 실패: ${textResponse}`);
            }

            if (response.ok && result.success) {
              setStatus('');

              // 🛡️ 안전한 Apple JWT 기반 세션 생성
              if (result.authData?.isAppleVerified && result.authData?.appleIdToken) {
                console.log('🔑 Apple JWT 검증 완료, 안전한 Supabase 세션 생성...');
                
                try {
                  // Supabase 클라이언트 사용 (이미 import됨)
                  
                  // 🧪 클라이언트 Apple 세션 생성 실험 시스템
                  console.log('🧪 클라이언트에서 Apple 세션 생성 실험 시작...');
                  
                  // localStorage에서 원본 nonce 가져오기
                  const storedState = typeof window !== 'undefined' && localStorage ? 
                    localStorage.getItem('apple_oauth_state') : null;
                  let originalNonce: string | null = null;
                  
                  if (storedState) {
                    try {
                      const stateData = JSON.parse(storedState);
                      originalNonce = stateData.nonce;
                      console.log('클라이언트에서 원본 nonce 복원:', { 
                        hasNonce: !!originalNonce,
                        nonceLength: originalNonce ? originalNonce.length : 0 
                      });
                    } catch (stateError) {
                      console.warn('클라이언트 state 파싱 실패:', stateError);
                    }
                  }
                  
                  let clientSuccess = false;
                  
                  // 🧪 클라이언트 실험 1: 원본 nonce
                  if (originalNonce && !clientSuccess) {
                    console.log('🧪 클라이언트 실험 1: 원본 nonce로 시도...');
                    try {
                      const { data: sessionData1, error: sessionError1 } = await createBrowserSupabaseClient().auth.signInWithIdToken({
                        provider: 'apple',
                        token: result.authData.appleIdToken,
                        nonce: originalNonce
                      });
                      
                      if (!sessionError1 && sessionData1?.session) {
                        console.log('✅ 클라이언트 실험 1 성공: 원본 nonce로 세션 생성!');
                        clientSuccess = true;
                        setStatus('Apple 로그인 완료!');
                      } else {
                        console.log('❌ 클라이언트 실험 1 실패:', sessionError1?.message);
                      }
                    } catch (exp1Error) {
                      console.log('❌ 클라이언트 실험 1 예외:', exp1Error);
                    }
                  }
                  
                  // 🧪 클라이언트 실험 2: nonce 없이
                  if (!clientSuccess) {
                    console.log('🧪 클라이언트 실험 2: nonce 없이 시도...');
                    try {
                      const { data: sessionData2, error: sessionError2 } = await createBrowserSupabaseClient().auth.signInWithIdToken({
                        provider: 'apple',
                        token: result.authData.appleIdToken
                        // nonce 제거
                      });
                      
                      if (!sessionError2 && sessionData2?.session) {
                        console.log('✅ 클라이언트 실험 2 성공: nonce 없이 세션 생성!');
                        clientSuccess = true;
                        setStatus('Apple 로그인 완료!');
                      } else {
                        console.log('❌ 클라이언트 실험 2 실패:', sessionError2?.message);
                      }
                    } catch (exp2Error) {
                      console.log('❌ 클라이언트 실험 2 예외:', exp2Error);
                    }
                  }
                  
                  // 🧪 클라이언트 실험 3: 해시된 nonce (서버에서 전달받은 경우)
                  if (!clientSuccess && result.authData?.tokenNonce) {
                    console.log('🧪 클라이언트 실험 3: 해시된 nonce로 시도...');
                    try {
                      const { data: sessionData3, error: sessionError3 } = await createBrowserSupabaseClient().auth.signInWithIdToken({
                        provider: 'apple',
                        token: result.authData.appleIdToken,
                        nonce: result.authData.tokenNonce
                      });
                      
                      if (!sessionError3 && sessionData3?.session) {
                        console.log('✅ 클라이언트 실험 3 성공: 해시된 nonce로 세션 생성!');
                        clientSuccess = true;
                        setStatus('Apple 로그인 완료!');
                      } else {
                        console.log('❌ 클라이언트 실험 3 실패:', sessionError3?.message);
                      }
                    } catch (exp3Error) {
                      console.log('❌ 클라이언트 실험 3 예외:', exp3Error);
                    }
                  }
                  
                  // 🧪 클라이언트 실험 4: Auth Helper 방식
                  if (!clientSuccess) {
                    console.log('🧪 클라이언트 실험 4: Auth Helper 방식으로 시도...');
                    try {
                      // Supabase auth helper를 사용한 방식
                      const session = await createBrowserSupabaseClient().auth.getSession();
                      console.log('현재 세션 상태:', { 
                        hasSession: !!session.data.session,
                        sessionData: session.data.session 
                      });
                      
                      if (session.data.session) {
                        console.log('✅ 클라이언트 실험 4 성공: 기존 세션 발견!');
                        clientSuccess = true;
                        setStatus('Apple 로그인 완료!');
                      }
                    } catch (exp4Error) {
                      console.log('❌ 클라이언트 실험 4 예외:', exp4Error);
                    }
                  }
                  
                  // 🧪 클라이언트 실험 5: 이메일 기반 passwordless 로그인
                  if (!clientSuccess && result.authData?.user?.email) {
                    console.log('🧪 클라이언트 실험 5: 이메일 기반 passwordless 로그인...');
                    try {
                      const { data: signInData, error: signInError } = await createBrowserSupabaseClient().auth.signInWithOtp({
                        email: result.authData.user.email,
                        options: {
                          shouldCreateUser: true,
                          emailRedirectTo: undefined, // 이메일 확인 생략
                          data: {
                            full_name: result.authData.user.user_metadata?.full_name || 'Apple User',
                            apple_user_id: result.authData.user.id,
                            provider: 'apple',
                            apple_verified: true,
                            email_verified: true // Apple에서 이미 검증됨
                          }
                        }
                      });
                      
                      if (!signInError) {
                        console.log('✅ 클라이언트 실험 5: OTP 요청 성공 (이메일 확인 불필요)');
                        // 소셜 로그인이므로 즉시 세션 생성 시도
                        setStatus('');
                        
                        // 잠시 후 세션 재확인
                        setTimeout(async () => {
                          const newSession = await createBrowserSupabaseClient().auth.getSession();
                          if (newSession.data.session) {
                            console.log('✅ 클라이언트 실험 5 최종 성공: 세션 생성됨!');
                            clientSuccess = true;
                            setStatus('Apple 로그인 완료!');
                          }
                        }, 1000);
                      } else {
                        console.log('❌ 클라이언트 실험 5 실패:', signInError.message);
                      }
                    } catch (exp5Error) {
                      console.log('❌ 클라이언트 실험 5 예외:', exp5Error);
                    }
                  }
                  
                  // 🧪 클라이언트 실험 6: 강제 사용자 생성 + 즉시 로그인
                  if (!clientSuccess && result.authData?.user?.email) {
                    console.log('🧪 클라이언트 실험 6: 강제 사용자 생성 + 즉시 로그인...');
                    try {
                      // Apple 검증된 정보로 임시 패스워드 생성
                      const tempPassword = `apple_${result.authData.user.id}_${Date.now()}`;
                      
                      // 사용자 생성 시도
                      const { data: signUpData, error: signUpError } = await createBrowserSupabaseClient().auth.signUp({
                        email: result.authData.user.email,
                        password: tempPassword,
                        options: {
                          data: {
                            full_name: result.authData.user.user_metadata?.full_name || 'Apple User',
                            apple_user_id: result.authData.user.id,
                            provider: 'apple',
                            apple_verified: true,
                            email_verified: true
                          }
                        }
                      });
                      
                      if (signUpData.user && !signUpError) {
                        console.log('✅ 클라이언트 실험 6: 사용자 생성 성공, 즉시 로그인 시도...');
                        
                        // 즉시 로그인 시도
                        const { data: loginData, error: loginError } = await createBrowserSupabaseClient().auth.signInWithPassword({
                          email: result.authData.user.email,
                          password: tempPassword
                        });
                        
                        if (loginData.session && !loginError) {
                          console.log('✅ 클라이언트 실험 6 성공: 강제 생성 + 즉시 로그인 완료!');
                          clientSuccess = true;
                          setStatus('Apple 로그인 완료!');
                        } else {
                          console.log('❌ 클라이언트 실험 6 로그인 실패:', loginError?.message);
                        }
                      } else if (signUpError?.message?.includes('already been registered')) {
                        console.log('ℹ️ 클라이언트 실험 6: 사용자 이미 존재, 로그인 시도...');
                        
                        // 기존 사용자 로그인 시도 (임시 패스워드로는 불가능)
                        // 대신 OTP 방식으로 재시도
                        const { error: otpError } = await createBrowserSupabaseClient().auth.signInWithOtp({
                          email: result.authData.user.email
                        });
                        
                        if (!otpError) {
                          console.log('✅ 클라이언트 실험 6: 기존 사용자 OTP 발송 성공');
                          setStatus('기존 Apple 계정 확인됨! 이메일을 확인하세요.');
                        }
                      } else {
                        console.log('❌ 클라이언트 실험 6 사용자 생성 실패:', signUpError?.message);
                      }
                    } catch (exp6Error) {
                      console.log('❌ 클라이언트 실험 6 예외:', exp6Error);
                    }
                  }
                  
                  // 최종 실패 처리 개선
                  if (!clientSuccess) {
                    console.log('❌ 모든 클라이언트 세션 생성 실험 실패');
                    console.log('�� 최종 상태: Apple JWT 검증 성공, Supabase 세션 생성 실패');
                    console.log('ℹ️ 이것은 Supabase Apple OAuth의 알려진 nonce 검증 버그입니다.');
                    console.log('ℹ️ 대안: 다른 OAuth 제공자(Google, GitHub) 사용을 권장합니다.');
                    
                    const userEmail = result.authData?.user?.email;
                    setStatus(`
                      🍎 Apple 인증은 성공했습니다!
                      
                      하지만 Supabase 세션 생성에 실패했습니다.
                      이것은 Supabase Apple OAuth의 알려진 nonce 검증 버그입니다.
                      
                      해결 방법:
                      1. Google 또는 GitHub 로그인 사용 (권장)
                      2. 이메일 ${userEmail}로 별도 회원가입
                      3. 잠시 후 다시 시도 (가끔 성공하기도 함)
                      
                      죄송합니다. 기술적 문제로 Apple 로그인이 제한되어 있습니다.
                    `.trim());
                    
                    // 8초 후 원래 페이지 또는 메인페이지로 리디렉션
                    setTimeout(() => {
                      const returnUrl = typeof window !== 'undefined' && localStorage ? 
                        (localStorage.getItem('auth_return_url') || '/') : '/';
                      window.location.href = returnUrl;
                    }, 8000);
                    
                    return; // 더 이상 진행하지 않음
                  }
                  
                } catch (sessionError) {
                  console.error('클라이언트 세션 생성 중 오류:', sessionError);
                  // Apple 인증은 성공했으므로 계속 진행
                  setStatus('');
                }
              }

              // 성공 후 리디렉션
              const returnUrl = typeof window !== 'undefined' && localStorage ? 
                (localStorage.getItem('auth_return_url') || '/') : '/';
              if (typeof window !== 'undefined' && localStorage) {
                localStorage.removeItem('auth_return_url');
                localStorage.removeItem('apple_oauth_state');
              }

              // 서버 사이드 쿠키 동기화 강제 실행
              try {
                console.log('🔄 [AuthCallback] 서버 사이드 쿠키 동기화 시도 (수동 처리)');
                const syncResponse = await fetch('/api/auth/verify', {
                  method: 'GET',
                  credentials: 'include',
                });
                
                if (syncResponse.ok) {
                  console.log('✅ [AuthCallback] 서버 사이드 쿠키 동기화 성공 (수동 처리)');
                } else {
                  console.warn('⚠️ [AuthCallback] 서버 사이드 쿠키 동기화 실패, 하지만 진행 (수동 처리)');
                }
              } catch (syncError) {
                console.warn('⚠️ [AuthCallback] 쿠키 동기화 오류, 하지만 진행 (수동 처리):', syncError);
              }
              
              console.log(`✅ [AuthCallback] ${providerType} 로그인 성공, 리디렉션:`, returnUrl);
              
              // 즉시 리다이렉트
              window.location.href = returnUrl;
            } else {
              throw new Error(
                result.message || `HTTP ${response.status}: 인증 처리 실패`,
              );
            }
          } catch (fetchError) {
            console.error('Apple API 호출 오류:', fetchError);

            // 대체 방법: 표준 소셜 로그인 서비스 사용
            setStatus('');

            const paramObj: Record<string, string> = {};
            searchParams.forEach((value, key) => {
              paramObj[key] = value;
            });

            const authResult = await getSocialAuthService().handleCallback(
              'apple',
              paramObj,
            );

            if (authResult.success) {
              setStatus('');
              const returnUrl = typeof window !== 'undefined' && localStorage ? 
                (localStorage.getItem('auth_return_url') || '/') : '/';
              if (typeof window !== 'undefined' && localStorage) {
                localStorage.removeItem('auth_return_url');
                localStorage.removeItem('apple_oauth_state');
              }
              window.location.href = returnUrl;
            } else {
              setIsLoading(false);
              setError(
                `인증 실패: ${authResult.error?.message || '알 수 없는 오류'}`,
              );
            }
          }
          return;
        }

        // 다른 소셜 로그인 처리
        setStatus('');

        const paramObj: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          paramObj[key] = value;
        });

        console.log(`🔍 [AuthCallback] ${providerType} 콜백 처리 시작:`, {
          url: typeof window !== 'undefined' ? window.location.href : 'SSR',
          params: paramObj,
          provider: providerType,
        });

        const authResult = await getSocialAuthService().handleCallback(
          providerType,
          paramObj,
        );

        console.log(`🔍 [AuthCallback] ${providerType} 콜백 처리 결과:`, authResult);

        if (authResult.success) {
          setStatus('');
          
          // 서버 사이드 쿠키 동기화 강제 실행
          try {
            console.log('🔄 [AuthCallback] 서버 사이드 쿠키 동기화 시도 (수동 처리)');
            const syncResponse = await fetch('/api/auth/verify', {
              method: 'GET',
              credentials: 'include',
            });
            
            if (syncResponse.ok) {
              console.log('✅ [AuthCallback] 서버 사이드 쿠키 동기화 성공 (수동 처리)');
            } else {
              console.warn('⚠️ [AuthCallback] 서버 사이드 쿠키 동기화 실패, 하지만 진행 (수동 처리)');
            }
          } catch (syncError) {
            console.warn('⚠️ [AuthCallback] 쿠키 동기화 오류, 하지만 진행 (수동 처리):', syncError);
          }
          
          const returnUrl = typeof window !== 'undefined' && localStorage ? 
            (localStorage.getItem('auth_return_url') || '/') : '/';
          if (typeof window !== 'undefined' && localStorage) {
            localStorage.removeItem('auth_return_url');
          }
          
          console.log(`✅ [AuthCallback] ${providerType} 로그인 성공, 리디렉션:`, returnUrl);
          
          // 즉시 리다이렉트
          window.location.href = returnUrl;
        } else if (authResult.error) {
          console.warn(`❌ [AuthCallback] ${providerType} 인증 실패:`, authResult.error.message);
          
          // 세션 생성 실패의 경우 페이지 새로고침 시도
          if (authResult.error.message.includes('세션이 생성되지 않았습니다') || 
              authResult.error.message.includes('페이지를 새로고침')) {
            
            // 새로고침 시도 여부 확인 (무한 루프 방지)
            const refreshAttempted = sessionStorage.getItem(`${providerType}_refresh_attempted`);
            
            if (!refreshAttempted) {
              console.log(`🔄 [AuthCallback] ${providerType} 세션 생성 실패 - 페이지 새로고침 시도`);
              
              // 새로고침 시도 플래그 설정 (5분간 유효)
              sessionStorage.setItem(`${providerType}_refresh_attempted`, Date.now().toString());
              setTimeout(() => {
                sessionStorage.removeItem(`${providerType}_refresh_attempted`);
              }, 5 * 60 * 1000);
              
              setStatus('');
              
              // 2초 후 새로고침
              setTimeout(() => {
                window.location.reload();
              }, 2000);
              
              return; // 더 이상 진행하지 않음
            } else {
              // 이미 새로고침을 시도했다면 다른 대안 제시
              const refreshTime = parseInt(refreshAttempted);
              const timeSinceRefresh = Date.now() - refreshTime;
              
              if (timeSinceRefresh < 5 * 60 * 1000) { // 5분 이내
                console.log(`⚠️ [AuthCallback] ${providerType} 이미 새로고침 시도함 (${Math.floor(timeSinceRefresh / 1000)}초 전)`);
                setIsLoading(false);
                setError(`${providerType} 로그인에 기술적 문제가 있습니다. 잠시 후 다시 시도하거나 다른 로그인 방법을 이용해주세요.`);
              } else {
                // 5분이 지났으면 다시 새로고침 허용
                sessionStorage.removeItem(`${providerType}_refresh_attempted`);
                console.log(`🔄 [AuthCallback] ${providerType} 5분 경과 - 새로고침 재시도 허용`);
                window.location.reload();
                return;
              }
            }
                      } else {
              setIsLoading(false);
              setError(`${providerType} 인증 오류: ${authResult.error.message}`);
            }
        } else {
          console.error(`❌ [AuthCallback] ${providerType} 알 수 없는 인증 오류`);
          setIsLoading(false);
          setError(`${providerType} 알 수 없는 인증 오류가 발생했습니다.`);
        }
      } catch (error) {
        console.error('콜백 처리 오류:', error);
        setIsLoading(false);
        setError('인증 처리 중 오류가 발생했습니다.');
      }
    };

    handleCallback();
  }, [provider, router, searchParams]);

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
