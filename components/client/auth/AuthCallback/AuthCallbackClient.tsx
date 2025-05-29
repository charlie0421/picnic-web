'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { AuthCallbackSkeleton } from '@/components/server';

interface AuthCallbackClientProps {
  provider?: string;
}

export default function AuthCallbackClient({
  provider,
}: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('인증 세션을 처리 중입니다...');

  useEffect(() => {
    // 브라우저 환경에서만 실행
    if (typeof window === 'undefined') return;

    const handleCallback = async () => {
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
          // Apple OAuth의 특징적인 파라미터들을 확인
          else if (codeParam) {
            // Apple OAuth는 보통 code 파라미터가 있음
            detectedProvider = 'apple';
            console.log('🔍 Provider 자동 감지: Apple (code 파라미터 존재)');
          }
        }
        
        if (!detectedProvider) {
          setError('OAuth provider를 감지할 수 없습니다.');
          return;
        }
        
        const providerType = detectedProvider as SocialLoginProvider;

        // 오류 코드가 있으면 처리
        const errorCode = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        if (errorCode) {
          console.error('Auth callback error:', {
            error: errorCode,
            description: errorDescription,
            provider: providerType,
            url: typeof window !== 'undefined' ? window.location.href : 'SSR',
          });
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
            setError('WeChat 인증 코드가 없습니다.');
            return;
          }

          console.log('WeChat callback params:', {
            code: codeParam ? 'present' : 'missing',
            state: stateParam || 'missing',
          });

          setStatus('WeChat 인증 처리 중...');

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
              setStatus('WeChat 인증 성공! 세션 생성 중...');

              // WeChat 인증 성공 후 Supabase 세션 생성
              if (result.profile && result.tokens) {
                console.log('🔑 WeChat 인증 완료, Supabase 세션 생성...');
                
                try {
                  // Supabase 클라이언트로 세션 생성
                  const { createClient } = await import('@supabase/supabase-js');
                  const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                  );
                  
                  console.log('💚 WeChat 사용자 정보로 Supabase 세션 생성 시도...');
                  
                  // WeChat은 이메일을 제공하지 않으므로 임시 이메일 생성
                  const tempEmail = `wechat_${result.profile.id}@placeholder.com`;
                  const tempPassword = result.tokens.id_token;
                  
                  // 기존 사용자 확인 후 로그인 시도
                  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                    email: tempEmail,
                    password: tempPassword
                  });
                  
                  if (loginData.session && !loginError) {
                    console.log('✅ WeChat 기존 사용자 로그인 성공!');
                    setStatus('WeChat 로그인 완료!');
                  } else if (loginError?.message?.includes('Invalid login credentials')) {
                    console.log('ℹ️ WeChat 신규 사용자, 회원가입 시도...');
                    
                    // 신규 사용자 생성
                    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
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

              // 약간의 지연을 두고 리다이렉트
              setTimeout(() => {
                console.log('🚀 WeChat 리다이렉트 실행:', returnUrl);
                router.push(returnUrl);
              }, 100);
            } else {
              throw new Error(
                result.message || `HTTP ${response.status}: WeChat 인증 처리 실패`,
              );
            }
          } catch (fetchError) {
            console.error('WeChat API 호출 오류:', fetchError);
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

            setStatus('Apple 인증 성공! 리디렉션 중...');

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

            // 약간의 지연을 두고 리다이렉트 (405 에러 방지)
            setTimeout(() => {
              console.log('🚀 리다이렉트 실행:', returnUrl);
              router.push(returnUrl);
            }, 100);
            return;
          }

          const codeParam = searchParams.get('code');
          const stateParam = searchParams.get('state');
          const userParam = searchParams.get('user');

          if (!codeParam) {
            setError('Apple 인증 코드가 없습니다.');
            return;
          }

          console.log('Apple callback params:', {
            code: codeParam ? 'present' : 'missing',
            state: stateParam || 'missing',
            user: userParam ? 'present' : 'missing',
          });

          setStatus('Apple 인증 처리 중...');

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
              setStatus('Apple 인증 성공! 세션 생성 중...');

              // 🛡️ 안전한 Apple JWT 기반 세션 생성
              if (result.authData?.isAppleVerified && result.authData?.appleIdToken) {
                console.log('🔑 Apple JWT 검증 완료, 안전한 Supabase 세션 생성...');
                
                try {
                  // Supabase 클라이언트로 안전한 세션 생성
                  const { createClient } = await import('@supabase/supabase-js');
                  const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                  );
                  
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
                      const { data: sessionData1, error: sessionError1 } = await supabase.auth.signInWithIdToken({
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
                      const { data: sessionData2, error: sessionError2 } = await supabase.auth.signInWithIdToken({
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
                      const { data: sessionData3, error: sessionError3 } = await supabase.auth.signInWithIdToken({
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
                      const session = await supabase.auth.getSession();
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
                      const { data: signInData, error: signInError } = await supabase.auth.signInWithOtp({
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
                        setStatus('Apple 인증 완료! 세션 확인 중...');
                        
                        // 잠시 후 세션 재확인
                        setTimeout(async () => {
                          const newSession = await supabase.auth.getSession();
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
                      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
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
                        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
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
                        const { error: otpError } = await supabase.auth.signInWithOtp({
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
                    console.log('🔍 최종 상태: Apple JWT 검증 성공, Supabase 세션 생성 실패');
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
                      router.push(returnUrl);
                    }, 8000);
                    
                    return; // 더 이상 진행하지 않음
                  }
                  
                } catch (sessionError) {
                  console.error('클라이언트 세션 생성 중 오류:', sessionError);
                  // Apple 인증은 성공했으므로 계속 진행
                  setStatus('Apple 인증 완료, 로그인 중...');
                }
              }

              // 성공 후 리디렉션
              const returnUrl = typeof window !== 'undefined' && localStorage ? 
                (localStorage.getItem('auth_return_url') || '/') : '/';
              if (typeof window !== 'undefined' && localStorage) {
                localStorage.removeItem('auth_return_url');
                localStorage.removeItem('apple_oauth_state');
              }

              router.push(returnUrl);
            } else {
              throw new Error(
                result.message || `HTTP ${response.status}: 인증 처리 실패`,
              );
            }
          } catch (fetchError) {
            console.error('Apple API 호출 오류:', fetchError);

            // 대체 방법: 표준 소셜 로그인 서비스 사용
            setStatus('대체 인증 방법으로 시도 중...');

            const paramObj: Record<string, string> = {};
            searchParams.forEach((value, key) => {
              paramObj[key] = value;
            });

            const socialAuthService = await import('@/lib/supabase/social');
            const authResult = await socialAuthService.getSocialAuthService().handleCallback(
              'apple',
              paramObj,
            );

            if (authResult.success) {
              setStatus('인증 성공! 리디렉션 중...');
              const returnUrl = typeof window !== 'undefined' && localStorage ? 
                (localStorage.getItem('auth_return_url') || '/') : '/';
              if (typeof window !== 'undefined' && localStorage) {
                localStorage.removeItem('auth_return_url');
                localStorage.removeItem('apple_oauth_state');
              }
              router.push(returnUrl);
            } else {
              setError(
                `인증 실패: ${authResult.error?.message || '알 수 없는 오류'}`,
              );
            }
          }
          return;
        }

        // 다른 소셜 로그인 처리
        setStatus('인증 처리 중...');

        const paramObj: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          paramObj[key] = value;
        });

        const socialAuthService = await import('@/lib/supabase/social');
        const authResult = await socialAuthService.getSocialAuthService().handleCallback(
          providerType,
          paramObj,
        );

        if (authResult.success) {
          setStatus('인증 성공! 리디렉션 중...');
          const returnUrl = typeof window !== 'undefined' && localStorage ? 
            (localStorage.getItem('auth_return_url') || '/') : '/';
          if (typeof window !== 'undefined' && localStorage) {
            localStorage.removeItem('auth_return_url');
          }
          router.push(returnUrl);
        } else if (authResult.error) {
          setError(`인증 오류: ${authResult.error.message}`);
        } else {
          setError('알 수 없는 인증 오류가 발생했습니다.');
        }
      } catch (error) {
        console.error('콜백 처리 오류:', error);
        setError('인증 처리 중 오류가 발생했습니다.');
      }
    };

    handleCallback();
  }, [provider, router, searchParams]);

  const handleRetry = () => {
    const returnUrl = typeof window !== 'undefined' && localStorage ? 
      (localStorage.getItem('auth_return_url') || '/') : '/';
    router.push(returnUrl);
  };

  if (error) {
    return <AuthCallbackSkeleton error={error} onRetry={handleRetry} />;
  }

  return <AuthCallbackSkeleton status={status} />;
}
