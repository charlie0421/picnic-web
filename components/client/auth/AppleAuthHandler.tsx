'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSocialAuthService } from '@/lib/supabase/social';

/**
 * Apple OAuth 성공 후 클라이언트 사이드 세션 처리
 */
export function AppleAuthHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleAppleAuth = async () => {
      const appleAuth = searchParams.get('apple_auth');
      const appleId = searchParams.get('apple_id');
      const email = searchParams.get('email');

      if (appleAuth === 'success' && appleId) {
        console.log('🍎 Apple OAuth 성공 감지, 세션 처리 시작:', {
          appleId,
          email: email || 'missing',
        });

        try {
          // 기존 소셜 로그인 서비스 활용
          const socialAuthService = getSocialAuthService();

          // Apple 콜백 처리 (기존 로직 활용)
          const authResult = await socialAuthService.handleCallback('apple', {
            apple_id: appleId,
            email: email || '',
            success: 'true',
          });

          if (authResult.success) {
            console.log('✅ Apple 세션 생성 성공');

            // URL에서 Apple OAuth 파라미터 제거
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('apple_auth');
            newUrl.searchParams.delete('apple_id');
            newUrl.searchParams.delete('email');

            // 히스토리 교체 (페이지 새로고침 없이)
            window.history.replaceState({}, '', newUrl.toString());
          } else {
            console.error('❌ Apple 세션 생성 실패:', authResult.error);
          }
        } catch (error) {
          console.error('Apple 세션 처리 오류:', error);
        }
      } else if (appleAuth === 'error') {
        console.error('❌ Apple OAuth 오류 감지');

        // 오류 파라미터 제거
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('apple_auth');
        newUrl.searchParams.delete('message');
        window.history.replaceState({}, '', newUrl.toString());
      }
    };

    handleAppleAuth();
  }, [searchParams]);

  // 이 컴포넌트는 UI를 렌더링하지 않음
  return null;
}
