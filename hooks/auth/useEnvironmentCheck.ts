'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { debugLog } from '@/utils/debug';

export function useEnvironmentCheck(mounted: boolean) {
  const [envCheckFailed, setEnvCheckFailed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!mounted || envCheckFailed !== null) return;

    const checkEnvironment = () => {
      try {
        const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
        const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (process.env.NODE_ENV === 'development') {
          debugLog('환경 변수 상태 확인', {
            hasUrl,
            hasKey,
            url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20) + '...',
          });
        }

        if (!hasUrl || !hasKey) {
          console.error('❌ 필수 환경 변수가 누락되었습니다.', {
            NEXT_PUBLIC_SUPABASE_URL: hasUrl,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: hasKey,
          });
          setEnvCheckFailed(true);
          return;
        }

        try {
          const testClient = createBrowserSupabaseClient();
          if (!testClient) {
            throw new Error('클라이언트 생성 실패');
          }
          if (process.env.NODE_ENV === 'development') {
            debugLog('✅ Supabase 클라이언트 생성 성공');
          }
        } catch (clientError) {
          console.error('❌ Supabase 클라이언트 생성 실패:', clientError);
          setEnvCheckFailed(true);
          return;
        }

        setEnvCheckFailed(false);
      } catch (error) {
        console.error('❌ 환경 확인 중 오류:', error);
        setEnvCheckFailed(true);
      }
    };

    checkEnvironment();
  }, [mounted, envCheckFailed]);

  return envCheckFailed;
}
