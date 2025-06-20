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
      {/* 즉시 로딩바를 표시하는 스크립트 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // 페이지 로드 즉시 로딩바 생성
            (function() {
              console.log('🔄 [OAuth Callback] 범용 콜백 즉시 로딩바 생성');
              
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
        <AuthCallback />
      </Suspense>
    </>
  );
} 