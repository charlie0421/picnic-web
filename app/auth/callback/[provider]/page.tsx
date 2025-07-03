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
              try {
                console.log('🔄 [OAuth Callback] 즉시 로딩바 생성 시작');
                console.log('🔍 [OAuth Callback] URL:', window.location.href);
                console.log('🔍 [OAuth Callback] Provider: ${provider}');
                
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
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  z-index: 9999;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
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
                  margin-bottom: 16px;
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
                
                const statusText = document.createElement('div');
                statusText.style.cssText = \`
                  color: #374151;
                  font-size: 16px;
                  margin-bottom: 8px;
                \`;
                statusText.textContent = '구글 로그인 처리 중...';
                
                const debugText = document.createElement('div');
                debugText.style.cssText = \`
                  color: #6b7280;
                  font-size: 12px;
                  text-align: center;
                  max-width: 400px;
                \`;
                debugText.textContent = 'Provider: ${provider} | ' + new Date().toLocaleTimeString();
                
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
                loadingDiv.appendChild(statusText);
                loadingDiv.appendChild(debugText);
                
                // 즉시 body에 추가 시도
                if (document.body) {
                  document.body.appendChild(loadingDiv);
                  console.log('✅ [OAuth Callback] 로딩바 즉시 추가 완료');
                } else {
                  // DOM 준비 대기
                  const addLoadingBar = () => {
                    if (document.body) {
                      document.body.appendChild(loadingDiv);
                      console.log('✅ [OAuth Callback] 로딩바 DOMContentLoaded 후 추가 완료');
                    } else {
                      // body가 아직 없으면 html에 직접 추가
                      document.documentElement.appendChild(loadingDiv);
                      console.log('✅ [OAuth Callback] 로딩바 documentElement에 추가 완료');
                    }
                  };
                  
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', addLoadingBar);
                  } else {
                    addLoadingBar();
                  }
                }
                
                // 10초 후 타임아웃 처리
                setTimeout(() => {
                  const loading = document.getElementById('oauth-loading');
                  if (loading) {
                    statusText.textContent = '처리 시간이 오래 걸리고 있습니다...';
                    statusText.style.color = '#dc2626';
                  }
                }, 10000);
                
              } catch (error) {
                console.error('❌ [OAuth Callback] 로딩바 생성 중 오류:', error);
                
                // 에러 시 최소한의 메시지라도 표시
                document.write('<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;font-family:sans-serif;"><h2>구글 로그인 처리 중...</h2><p>잠시만 기다려주세요.</p></div>');
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
