'use client';

import { use } from 'react';
import { AuthCallbackClient } from '@/components/client/auth';

interface CallbackPageProps {
  params: Promise<{ provider: string }>;
}

export default function CallbackPage({ params }: CallbackPageProps) {
  // Next.js 15 요구사항: params를 React.use()로 unwrap
  const { provider } = use(params);
  
  return (
    <>
      {/* 빠른 로딩 시작을 위한 최소한의 스크립트 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // OAuth 콜백 페이지 진입 즉시 기본 로딩 표시
            (function() {
              console.log('🔄 [OAuth Callback] ${provider} 콜백 페이지 진입');
              
              // 간단한 로딩 표시
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
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
              \`;
              
              loadingDiv.innerHTML = \`
                <div style="text-align: center; color: #6b7280;">
                  <div style="margin-bottom: 16px;">🔄</div>
                  <div>로그인 처리 중...</div>
                </div>
              \`;
              
              // 부드러운 fade-in
              if (document.body) {
                document.body.appendChild(loadingDiv);
                setTimeout(() => { loadingDiv.style.opacity = '1'; }, 10);
              } else {
                document.addEventListener('DOMContentLoaded', function() {
                  document.body.appendChild(loadingDiv);
                  setTimeout(() => { loadingDiv.style.opacity = '1'; }, 10);
                });
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
