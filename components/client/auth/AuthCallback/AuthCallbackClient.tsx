'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { handlePostLoginRedirect, normalizeRedirectPath } from '@/utils/auth-redirect';
import { logAuth, AuthLog } from '@/utils/auth-logger';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

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

        // 1차 시도: 브라우저에서 직접 Code Exchange (쿠키 속성/도메인 이슈 회피)
        let error: { message: string } | undefined;
        try {
          const supabase = createBrowserSupabaseClient();
          const { data, error: clientErr } = await supabase.auth.exchangeCodeForSession(code);
          if (clientErr || !data?.session) {
            error = { message: clientErr?.message || '클라이언트 교환 실패' };
          }
        } catch (e: any) {
          error = { message: e?.message || '클라이언트 교환 예외' };
        }

        // 폴백: 서버 API로 교환 시도
        if (error) {
          const res = await exchangeCode(code);
          error = res.error;
        }
        // 교환 직후 즉시 쿠키 기반 사용자 재평가를 트리거하기 위해 AuthProvider가 구독하는 verify 엔드포인트 호출
        try { await fetch('/api/auth/verify', { method: 'GET', credentials: 'include', cache: 'no-store' }); } catch {}
        if (error) {
          throw new Error(`인증 실패: ${error.message}`);
        }
        logAuth(AuthLog.CodeExchangeDone);

        const elapsedTime = Date.now() - startTime;
        const remainingTime = MIN_LOADING_TIME_MS - elapsedTime;
        if (remainingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        // 강건한 복귀 경로 결정: 쿼리(returnTo/return_url) > auth_return_url > 저장된 redirectUrl/loginRedirectUrl > 기존 유틸 > '/'
        let targetUrl: string | null = null;
        try {
          const qpReturnTo = searchParams.get('returnTo') || searchParams.get('return_url');
          let lsAuthReturn: string | null = null;
          let ckAuthReturn: string | null = null;
          let lsStored: string | null = null;
          if (typeof window !== 'undefined') {
            lsAuthReturn = localStorage.getItem('auth_return_url');
            ckAuthReturn = (document.cookie.match(/(?:^|; )auth_return_url=([^;]+)/)?.[1] ? decodeURIComponent(document.cookie.match(/(?:^|; )auth_return_url=([^;]+)/)![1]) : null);
            // 추가 폴백 키들도 확인
            lsStored = localStorage.getItem('loginRedirectUrl') || localStorage.getItem('redirectUrl') || sessionStorage.getItem('redirectUrl');
          }
          logAuth(AuthLog.ResolveRedirect, { phase: 'post-exchange', qpReturnTo, lsAuthReturn, ckAuthReturn, lsStored });
          if (qpReturnTo) {
            targetUrl = normalizeRedirectPath(qpReturnTo);
          } else if (lsAuthReturn) {
            targetUrl = normalizeRedirectPath(lsAuthReturn);
            try { localStorage.removeItem('auth_return_url'); } catch {}
          } else if (ckAuthReturn) {
            targetUrl = normalizeRedirectPath(ckAuthReturn);
            try { document.cookie = 'auth_return_url=; Max-Age=0; Path=/; SameSite=Lax'; } catch {}
          } else if (lsStored) {
            targetUrl = normalizeRedirectPath(lsStored);
          }
        } catch {}

        if (!targetUrl) {
          targetUrl = handlePostLoginRedirect();
        }

        if (!targetUrl || typeof targetUrl !== 'string') {
          targetUrl = '/';
        }

        targetUrl = normalizeRedirectPath(targetUrl);
        logAuth(AuthLog.RedirectTo, { targetUrl });
        // Next 라우터 대신 하드 리다이렉트로 후속 자동 리디렉션 간섭 차단
        if (typeof window !== 'undefined') {
          window.location.replace(targetUrl);
        } else {
          router.replace(targetUrl);
        }

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
