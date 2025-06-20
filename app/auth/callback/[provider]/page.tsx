import { Suspense } from 'react';
import AuthCallback from '@/components/client/auth/AuthCallback';

// 타입 정의 수정
type PageProps = {
  params: Promise<{ provider: string }>;
};

/**
 * 소셜 로그인 콜백 페이지
 *
 * 이 페이지는 서버 컴포넌트로 구현되고,
 * 필요한 인증 로직은 클라이언트 컴포넌트로 분리되어 있습니다.
 */
export default async function AuthCallbackPage({ params }: PageProps) {
  const { provider } = await params;

  return (
    <>
      {/* 즉시 로딩바를 표시하는 스크립트 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // 페이지 로드 즉시 로딩바 생성
            (function() {
              console.log('🔄 [OAuth Callback] 즉시 로딩바 생성');
              
              const loadingDiv = document.createElement('div');
              loadingDiv.id = 'oauth-loading';
              loadingDiv.style.cssText = \`
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: #f9fafb;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
              \`;
              
              const spinnerContainer = document.createElement('div');
              spinnerContainer.style.cssText = \`
                width: 64px;
                height: 64px;
                background: #dbeafe;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
              \`;
              
              const spinner = document.createElement('div');
              spinner.style.cssText = \`
                width: 32px;
                height: 32px;
                border: 4px solid #2563eb;
                border-top: 4px solid transparent;
                border-radius: 50%;
                animation: spin 1s linear infinite;
              \`;
              
              // CSS 애니메이션 추가
              if (!document.getElementById('spinner-style')) {
                const style = document.createElement('style');
                style.id = 'spinner-style';
                style.textContent = \`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                \`;
                document.head.appendChild(style);
              }
              
              spinnerContainer.appendChild(spinner);
              loadingDiv.appendChild(spinnerContainer);
              
              // body가 준비되면 즉시 추가
              if (document.body) {
                document.body.appendChild(loadingDiv);
              } else {
                document.addEventListener('DOMContentLoaded', function() {
                  document.body.appendChild(loadingDiv);
                });
              }
            })();
          `
        }}
      />

      {/* 클라이언트 컴포넌트 */}
      <Suspense fallback={null}>
        <AuthCallback provider={provider} />
      </Suspense>
    </>
  );
}
