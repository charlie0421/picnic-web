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
              
              // 로딩바 컨테이너
              const container = document.createElement('div');
              container.style.cssText = \`
                text-align: center;
              \`;
              
              // 심플한 로딩바
              const loadingBar = document.createElement('div');
              loadingBar.style.cssText = \`
                position: relative;
                width: 80px;
                height: 80px;
                margin: 0 auto;
              \`;
              
              // 외부 원
              const outerCircle = document.createElement('div');
              outerCircle.style.cssText = \`
                width: 80px;
                height: 80px;
                border: 4px solid #e5e7eb;
                border-radius: 50%;
              \`;
              
              // 회전하는 로딩바
              const spinnerCircle = document.createElement('div');
              spinnerCircle.style.cssText = \`
                position: absolute;
                top: 0;
                left: 0;
                width: 80px;
                height: 80px;
                border: 4px solid #3b82f6;
                border-top: 4px solid transparent;
                border-radius: 50%;
                animation: spin 1s linear infinite;
              \`;
              
              // 점 애니메이션 컨테이너
              const dotsContainer = document.createElement('div');
              dotsContainer.style.cssText = \`
                display: flex;
                justify-content: center;
                align-items: center;
                margin-top: 24px;
                gap: 4px;
              \`;
              
              // 3개의 점 생성
              for (let i = 0; i < 3; i++) {
                const dot = document.createElement('div');
                dot.style.cssText = \`
                  width: 8px;
                  height: 8px;
                  background: #3b82f6;
                  border-radius: 50%;
                  animation: pulse 1.5s ease-in-out \${i * 0.2}s infinite;
                \`;
                dotsContainer.appendChild(dot);
              }
              
              // CSS 애니메이션 추가
              if (!document.getElementById('loading-style')) {
                const style = document.createElement('style');
                style.id = 'loading-style';
                style.textContent = \`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  @keyframes pulse {
                    0%, 80%, 100% { 
                      transform: scale(0.8);
                      opacity: 0.5;
                    }
                    40% { 
                      transform: scale(1);
                      opacity: 1;
                    }
                  }
                \`;
                document.head.appendChild(style);
              }
              
              // 요소들 조립
              loadingBar.appendChild(outerCircle);
              loadingBar.appendChild(spinnerCircle);
              container.appendChild(loadingBar);
              container.appendChild(dotsContainer);
              loadingDiv.appendChild(container);
              
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