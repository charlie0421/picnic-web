// app/global-error.tsx
'use client';

import { useEffect } from 'react';
import { ErrorHandler, createContext } from '@/utils/error';

/**
 * 글로벌 에러 처리 컴포넌트
 * 
 * Next.js App Router에서 최상위 레벨의 에러를 처리합니다.
 * 중앙화된 에러 핸들링 시스템과 통합되어 있습니다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 글로벌 에러를 중앙화된 시스템으로 처리
    const handleGlobalError = async () => {
      try {
        const context = createContext()
          .setUrl(typeof window !== 'undefined' ? window.location.href : '')
          .setUserAgent(typeof window !== 'undefined' ? window.navigator.userAgent : '')
          .setAdditionalData({
            digest: error.digest,
            errorBoundary: 'global',
            isGlobalError: true,
            timestamp: new Date().toISOString(),
          })
          .build();

        const appError = await ErrorHandler.handle(error, context);
        
        // 글로벌 에러는 심각도가 높으므로 추가 로깅
        console.error('🚨 GLOBAL ERROR CAUGHT:', {
          message: appError.message,
          category: appError.category,
          severity: appError.severity,
          statusCode: appError.statusCode,
          timestamp: appError.timestamp,
          context: appError.context,
        });

      } catch (handlingError) {
        console.error('글로벌 에러 처리 중 오류:', handlingError);
        // 최후의 수단으로 기본 로깅
        console.error('원본 글로벌 에러:', error);
      }
    };

    handleGlobalError();
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-red-50">
          <div className="max-w-md">
            {/* 심각한 에러임을 나타내는 아이콘 */}
            <div className="text-6xl mb-6">🚨</div>
            
            <h1 className="text-3xl font-bold mb-4 text-red-800">
              심각한 오류가 발생했습니다
            </h1>
            
            <p className="text-red-700 mb-6">
              애플리케이션에 예기치 않은 심각한 오류가 발생했습니다. 
              이 문제가 계속되면 관리자에게 문의하세요.
            </p>
            
            {error.digest && (
              <div className="mb-6 p-3 bg-red-100 rounded-lg">
                <p className="text-xs text-red-600 font-mono">
                  오류 ID: {error.digest}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  이 ID를 관리자에게 전달해 주세요.
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              <button
                onClick={reset}
                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                애플리케이션 다시 시작
              </button>
              
              <button
                onClick={() => {
                  // 페이지 새로고침으로 완전 초기화
                  window.location.reload();
                }}
                className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                페이지 새로고침
              </button>
            </div>

            {/* 개발 환경에서만 상세 에러 정보 표시 */}
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-red-600 cursor-pointer">
                  개발자 정보 (개발 환경에서만 표시)
                </summary>
                <div className="mt-2 p-3 bg-red-100 rounded text-xs">
                  <p><strong>Error Name:</strong> {error.name}</p>
                  <p><strong>Error Message:</strong> {error.message}</p>
                  {error.digest && (
                    <p><strong>Error Digest:</strong> {error.digest}</p>
                  )}
                  {error.stack && (
                    <div className="mt-2">
                      <strong>Stack Trace:</strong>
                      <pre className="mt-1 overflow-auto text-red-700 whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* 사용자 피드백 링크 (프로덕션에서 유용) */}
            {process.env.NODE_ENV === 'production' && (
              <div className="mt-6 pt-6 border-t border-red-200">
                <p className="text-sm text-red-600 mb-2">
                  이 문제를 신고하시겠습니까?
                </p>
                <a
                  href={`mailto:support@picnic.com?subject=Global Error Report&body=Error ID: ${error.digest || 'N/A'}%0ATime: ${new Date().toISOString()}%0AUser Agent: ${encodeURIComponent(navigator.userAgent)}`}
                  className="text-sm text-red-700 underline hover:text-red-800"
                >
                  관리자에게 문의하기
                </a>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}