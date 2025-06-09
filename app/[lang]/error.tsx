'use client';

import { useEffect } from 'react';
import { ErrorHandler, createContext } from '@/utils/error';

/**
 * 언어별 라우트 에러 페이지
 * 
 * Next.js App Router의 error.js 컨벤션을 따르는 에러 처리 컴포넌트입니다.
 * 중앙화된 에러 핸들링 시스템과 통합되어 있습니다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 에러 컨텍스트 생성 및 중앙화된 핸들러로 처리
    const handleError = async () => {
      try {
        const context = createContext()
          .setUrl(typeof window !== 'undefined' ? window.location.href : '')
          .setUserAgent(typeof window !== 'undefined' ? window.navigator.userAgent : '')
          .setAdditionalData({
            digest: error.digest,
            errorBoundary: 'lang-route',
            routeSegment: '[lang]',
          })
          .build();

        await ErrorHandler.handle(error, context);
      } catch (handlingError) {
        console.error('에러 처리 중 오류:', handlingError);
      }
    };

    handleError();
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">😵</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          페이지 오류가 발생했습니다
        </h1>
        <p className="text-gray-600 mb-6">
          요청하신 페이지를 처리하는 중 문제가 발생했습니다. 
          잠시 후 다시 시도해 주세요.
        </p>
        
        {error.digest && (
          <p className="text-xs text-gray-500 mb-6 font-mono">
            오류 ID: {error.digest}
          </p>
        )}
        
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            다시 시도
          </button>
          
          <button
            onClick={() => window.location.href = '/'}
            className="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            홈으로 돌아가기
          </button>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 text-left">
            <summary className="text-sm text-gray-500 cursor-pointer">
              개발자 정보 (개발 환경에서만 표시)
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded text-xs">
              <p><strong>Error:</strong> {error.message}</p>
              {error.stack && (
                <pre className="mt-2 overflow-auto text-gray-600">
                  {error.stack}
                </pre>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
} 