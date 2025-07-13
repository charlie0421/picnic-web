import { Suspense } from 'react';
import AuthCallback from '@/components/client/auth/AuthCallback';

/**
 * 범용 OAuth 콜백 페이지
 * 
 * Supabase에서 OAuth 처리 후 /auth/callback로 리다이렉트할 때 사용
 * AuthCallback 컴포넌트에서 URL 파라미터나 기타 방법으로 provider를 감지
 */
export default function AuthCallbackPage() {
  return (
    <>
      {/* 전역 로딩바 즉시 시작 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // 페이지 로드 즉시 전역 로딩바 시작
            (function() {
              // 개발 환경에서만 로그 출력
              const isDev = ${process.env.NODE_ENV === 'development'};
              if (isDev) console.log('🔄 [OAuth Callback] 범용 콜백 전역 로딩바 시작');
              
              // 전역 로딩바 즉시 시작
              try {
                const event = new CustomEvent('startGlobalLoading', { detail: { reason: 'oauth-callback-page' } });
                window.dispatchEvent(event);
                if (isDev) console.log('🚀 [OAuth Callback] 전역 로딩바 이벤트 발송 완료');
              } catch (error) {
                if (isDev) console.warn('⚠️ [OAuth Callback] 전역 로딩바 이벤트 발송 실패:', error);
              }
            })();
          `
        }}
      />

      {/* 클라이언트 컴포넌트 */}
      <Suspense fallback={null}>
        <AuthCallback />
      </Suspense>
    </>
  );
} 