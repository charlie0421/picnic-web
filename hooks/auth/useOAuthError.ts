'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { debugLog } from '@/utils/debug';

export function useOAuthError(
  mounted: boolean,
  setError: (error: string) => void,
) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!mounted) return;

    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      debugLog('인증 오류 발생', { error, errorDescription });
      
      let errorMessage = `인증 오류: ${decodeURIComponent(errorDescription || error)}`;
      
      if (error === 'bad_oauth_state') {
        errorMessage = '보안상의 이유로 로그인이 취소되었습니다. 브라우저를 새로고침하고 다시 시도해주세요.';
        try {
          localStorage.removeItem('auth_return_url');
          sessionStorage.clear();
        } catch (e) {
          console.warn('스토리지 정리 중 오류:', e);
        }
      }
      
      setError(errorMessage);

      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      router.replace(url.toString());
    }
  }, [mounted, searchParams, router, setError]);
}
