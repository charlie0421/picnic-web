'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { debugLog } from '@/utils/debug';
import { useWithdrawnUserDialog } from '@/components/ui/Dialog/DialogProvider';
import { useLanguageStore } from '@/stores/languageStore';

export function useOAuthError(
  mounted: boolean,
  setError: (error: string) => void,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showWithdrawnUserDialog = useWithdrawnUserDialog();
  const { t } = useLanguageStore();

  useEffect(() => {
    if (!mounted) return;

    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      debugLog('인증 오류 발생', { error, errorDescription });

      // 탈퇴 계정으로 로그인을 시도한 경우 — 전용 다이얼로그 표시
      if (error === 'withdrawn') {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('error');
        cleanUrl.searchParams.delete('error_description');
        router.replace(cleanUrl.toString());

        showWithdrawnUserDialog({
          title: t('error_message_withdrawal'),
          description: t('error_message_withdrawal'),
        }).catch(() => {});
        return;
      }

      const authErrorLabel = t('login_error_auth') || '인증 오류';
      let errorMessage = `${authErrorLabel}: ${decodeURIComponent(errorDescription || error)}`;

      if (error === 'bad_oauth_state') {
        errorMessage =
          t('login_error_security_cancel') ||
          '보안상의 이유로 로그인이 취소되었습니다. 브라우저를 새로고침하고 다시 시도해주세요.';
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
  }, [mounted, searchParams, router, setError, showWithdrawnUserDialog, t]);
}
