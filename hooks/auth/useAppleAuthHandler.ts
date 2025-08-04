'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { handlePostLoginRedirect } from '@/utils/auth-redirect';
import { debugLog } from '@/utils/debug';

export function useAppleAuthHandler(
  mounted: boolean,
  setLoading: (loading: boolean) => void,
  setError: (error: string) => void,
) {
  const router = useRouter();

  useEffect(() => {
    if (!mounted) return;

    const checkAppleAuthSuccess = async () => {
      try {
        const authSuccess = localStorage.getItem('authSuccess');
        if (authSuccess !== 'true') return;

        setLoading(true);
        const appleEmail = localStorage.getItem('appleEmail');
        const appleIdToken = localStorage.getItem('appleIdToken');
        const appleNonce = localStorage.getItem('appleNonce');

        debugLog('Apple OAuth 성공 감지, 세션 생성 시도', {
          hasIdToken: !!appleIdToken,
          hasNonce: !!appleNonce,
          hasEmail: !!appleEmail,
        });

        const supabase = createBrowserSupabaseClient();
        if (!appleIdToken || !appleNonce || !supabase) {
          throw new Error('Apple ID Token 또는 nonce가 없습니다');
        }

        const { data: authData, error: authError } =
          await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: appleIdToken,
            nonce: appleNonce,
          });

        if (authError) {
          throw new Error(
            `Apple 세션 생성 실패: ${authError.message || '알 수 없는 오류'}`,
          );
        }

        if (authData.user) {
          debugLog('✅ Apple ID Token으로 Supabase 세션 생성 성공!', {
            userId: authData.user.id,
            email: authData.user.email,
          });
          localStorage.setItem('sessionCreated', 'true');
          setError('Apple 로그인이 성공적으로 완료되었습니다!');
          
          setTimeout(() => {
            const returnTo = new URLSearchParams(window.location.search).get('returnTo');
            const targetUrl = handlePostLoginRedirect(returnTo || undefined);
            router.push(targetUrl);
          }, 1000);
        }
      } catch (sessionError: any) {
        debugLog('세션 생성 중 오류', sessionError);
        setError(
          `Apple 로그인 후 세션 생성 중 오류가 발생했습니다: ${
            sessionError.message || '알 수 없는 오류'
          }`,
        );
      } finally {
        localStorage.removeItem('authSuccess');
        localStorage.removeItem('appleEmail');
        localStorage.removeItem('appleIdToken');
        localStorage.removeItem('appleNonce');
        setLoading(false);
      }
    };

    checkAppleAuthSuccess();
  }, [mounted, router, setLoading, setError]);
}
