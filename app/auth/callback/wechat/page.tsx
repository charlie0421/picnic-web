'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSocialAuthService } from '@/lib/supabase/social';

export default function WeChatCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get('code') || '';
      const state = searchParams.get('state') || '';

      try {
        const service = getSocialAuthService();
        const result = await service.handleCallback('wechat', { code, state });

        if (result.success) {
          // 로그인 후 홈(또는 이전 경로)로 이동. 공통 로직은 /auth/loading이 처리하지만,
          // 위챗 특성상 별도 콜백 경로를 거치므로 바로 홈으로 보냄.
          router.replace('/');
          return;
        }

        router.replace('/login?error=wechat_auth_failed');
      } catch (e) {
        console.error('WeChat 콜백 처리 오류:', e);
        router.replace('/login?error=wechat_callback_error');
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}


