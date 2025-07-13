import { AuthCallbackClient } from '@/components/client/auth';

interface CallbackPageProps {
  params: Promise<{ provider: string }>;
}

export default async function CallbackPage({ params }: CallbackPageProps) {
  // Next.js 15 요구사항: params를 await로 unwrap
  const { provider } = await params;
  
  return (
    <>
      {/* 전역 로딩바 즉시 시작 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // OAuth 콜백 페이지 진입 즉시 전역 로딩바 시작
            (function() {
              console.log('🔄 [OAuth Callback] ${provider} 콜백 페이지 진입 - 전역 로딩바 시작');
              
              // 전역 로딩바 즉시 표시
              try {
                const event = new CustomEvent('startGlobalLoading', { detail: { reason: 'oauth-callback' } });
                window.dispatchEvent(event);
                console.log('🚀 [OAuth Callback] 전역 로딩바 이벤트 발송 완료');
              } catch (error) {
                console.warn('⚠️ [OAuth Callback] 전역 로딩바 이벤트 발송 실패:', error);
              }
            })();
          `
        }}
      />

      {/* 클라이언트 컴포넌트 */}
      <AuthCallbackClient provider={provider} />
    </>
  );
}
