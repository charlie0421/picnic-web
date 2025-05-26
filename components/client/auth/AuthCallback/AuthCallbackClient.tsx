'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSocialAuthService } from '@/lib/supabase/social';
import type { SocialLoginProvider } from '@/lib/supabase/social/types';
import { AuthCallbackSkeleton } from '@/components/server';

interface AuthCallbackClientProps {
  provider: string;
}

export default function AuthCallbackClient({
  provider,
}: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('인증 세션을 처리 중입니다...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const providerType = provider as SocialLoginProvider;

        // 오류 코드가 있으면 처리
        const errorCode = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        if (errorCode) {
          console.error('Auth callback error:', {
            error: errorCode,
            description: errorDescription,
            provider: providerType,
            url: window.location.href,
          });
          setError(
            `인증 오류: ${errorCode} - ${
              errorDescription || '자세한 정보 없음'
            }`,
          );
          return;
        }

        // Apple 특수 처리
        if (providerType === 'apple') {
          console.log('🍎 Apple OAuth 콜백 처리 시작:', {
            url: window.location.href,
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
              currentUrl: window.location.href,
            });

            setStatus('Apple 인증 성공! 리디렉션 중...');

            // 성공 후 리디렉션
            const returnUrl = localStorage.getItem('auth_return_url') || '/';
            console.log('🔄 리다이렉트 준비:', {
              returnUrl,
              hasAuthReturnUrl: !!localStorage.getItem('auth_return_url'),
            });

            localStorage.removeItem('auth_return_url');
            localStorage.removeItem('apple_oauth_state');

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
              setStatus('인증 성공! 리디렉션 중...');

              // 성공 후 리디렉션
              const returnUrl = localStorage.getItem('auth_return_url') || '/';
              localStorage.removeItem('auth_return_url');
              localStorage.removeItem('apple_oauth_state');

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

            const socialAuthService = getSocialAuthService();
            const authResult = await socialAuthService.handleCallback(
              'apple',
              paramObj,
            );

            if (authResult.success) {
              setStatus('인증 성공! 리디렉션 중...');
              const returnUrl = localStorage.getItem('auth_return_url') || '/';
              localStorage.removeItem('auth_return_url');
              localStorage.removeItem('apple_oauth_state');
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

        const socialAuthService = getSocialAuthService();
        const authResult = await socialAuthService.handleCallback(
          providerType,
          paramObj,
        );

        if (authResult.success) {
          setStatus('인증 성공! 리디렉션 중...');
          const returnUrl = localStorage.getItem('auth_return_url') || '/';
          localStorage.removeItem('auth_return_url');
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
    router.push('/login');
  };

  if (error) {
    return <AuthCallbackSkeleton error={error} onRetry={handleRetry} />;
  }

  return <AuthCallbackSkeleton status={status} />;
}
