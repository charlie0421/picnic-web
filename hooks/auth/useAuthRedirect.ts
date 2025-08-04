'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { handlePostLoginRedirect } from '@/utils/auth-redirect';
import { debugLog } from '@/utils/debug';

export function useAuthRedirect(
  mounted: boolean,
  isAuthenticated: boolean,
  envCheckFailed: boolean | null,
) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (mounted && isAuthenticated && envCheckFailed === false) {
      debugLog('이미 인증된 사용자 - 즉시 리디렉트');
      const returnTo = searchParams.get('returnTo');
      const targetUrl = handlePostLoginRedirect(returnTo || undefined);
      router.replace(targetUrl);
    }
  }, [mounted, isAuthenticated, envCheckFailed, router, searchParams]);
}
