'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { handlePostLoginRedirect } from '@/utils/auth-redirect';

const MIN_LOADING_TIME_MS = 1500;

async function exchangeCode(code: string): Promise<{ error?: { message: string } }> {
  try {
    const response = await fetch('/api/auth/exchange-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: '알 수 없는 서버 오류' }));
      throw new Error(errorBody.message || `서버 오류: ${response.status}`);
    }
    return response.json();
  } catch (err: any) {
    console.error('API 요청 실패:', err);
    return { error: { message: err.message || '네트워크 오류가 발생했습니다.' } };
  }
}

/**
 * /auth/loading 페이지에서 실제 인증 처리를 담당하는 클라이언트 컴포넌트.
 * 이 컴포넌트는 UI를 렌더링하지 않으며, 전역 로딩 상태에 관여하지 않습니다.
 */
export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');

    const processAuth = async () => {
      const startTime = Date.now();

      try {
        if (!code) {
          throw new Error('인증 코드가 URL에 존재하지 않습니다.');
        }

        const { error } = await exchangeCode(code);
        if (error) {
          throw new Error(`인증 실패: ${error.message}`);
        }

        const elapsedTime = Date.now() - startTime;
        const remainingTime = MIN_LOADING_TIME_MS - elapsedTime;
        if (remainingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        }
        
        const targetUrl = handlePostLoginRedirect();
        router.replace(targetUrl);

      } catch (err: any) {
        console.error('인증 처리 중 오류:', err);
        alert(`로그인 중 문제가 발생했습니다: ${err.message}`);
        router.replace('/login?error=auth_processing_failed');
      }
    };

    processAuth();
  }, [router, searchParams]);

  return null;
}
