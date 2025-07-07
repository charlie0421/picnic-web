// app/global-error.tsx
'use client';

import { useEffect, useState } from 'react';
import { ErrorHandler, createContext } from '@/utils/error';

// 간단한 번역 객체
const translations = {
  ko: {
    title: '심각한 오류가 발생했습니다',
    description: '애플리케이션에 예기치 않은 심각한 오류가 발생했습니다. 이 문제가 계속되면 관리자에게 문의하세요.',
    restartButton: '애플리케이션 다시 시작',
    refreshButton: '페이지 새로고침',
    reportTitle: '이 문제를 신고하시겠습니까?',
    contactAdmin: '관리자에게 문의하기',
    reportNote: '이 ID를 관리자에게 전달해 주세요.',
    errorId: '오류 ID',
    developerInfo: '개발자 정보 (개발 환경에서만 표시)',
  },
  en: {
    title: 'A serious error occurred',
    description: 'An unexpected serious error occurred in the application. If this problem persists, please contact the administrator.',
    restartButton: 'Restart Application',
    refreshButton: 'Refresh Page',
    reportTitle: 'Would you like to report this issue?',
    contactAdmin: 'Contact Administrator',
    reportNote: 'Please provide this ID to the administrator.',
    errorId: 'Error ID',
    developerInfo: 'Developer Information (shown in development environment only)',
  },
  ja: {
    title: '深刻なエラーが発生しました',
    description: 'アプリケーションで予期しない深刻なエラーが発生しました。この問題が続く場合は、管理者にお問い合わせください。',
    restartButton: 'アプリケーションを再起動',
    refreshButton: 'ページを更新',
    reportTitle: 'この問題を報告しますか？',
    contactAdmin: '管理者に問い合わせる',
    reportNote: 'このIDを管理者にお伝えください。',
    errorId: 'エラーID',
    developerInfo: '開発者情報（開発環境でのみ表示）',
  },
  zh: {
    title: '发生严重错误',
    description: '应用程序发生了意外的严重错误。如果此问题持续存在，请联系管理员。',
    restartButton: '重启应用程序',
    refreshButton: '刷新页面',
    reportTitle: '您要报告此问题吗？',
    contactAdmin: '联系管理员',
    reportNote: '请将此ID提供给管理员。',
    errorId: '错误ID',
    developerInfo: '开发者信息（仅在开发环境中显示）',
  },
  id: {
    title: 'Terjadi Kesalahan Serius',
    description: 'Terjadi kesalahan serius yang tidak terduga dalam aplikasi. Jika masalah ini berlanjut, silakan hubungi administrator.',
    restartButton: 'Mulai Ulang Aplikasi',
    refreshButton: 'Refresh Halaman',
    reportTitle: 'Apakah Anda ingin melaporkan masalah ini?',
    contactAdmin: 'Hubungi Administrator',
    reportNote: 'Silakan berikan ID ini kepada administrator.',
    errorId: 'ID Kesalahan',
    developerInfo: 'Informasi Pengembang (hanya ditampilkan di lingkungan pengembangan)',
  },
};

// 언어 감지 함수
const detectLanguage = (): keyof typeof translations => {
  if (typeof window === 'undefined') return 'ko';
  
  // URL에서 언어 추출 시도
  const pathLang = window.location.pathname.split('/')[1];
  if (pathLang && pathLang in translations) {
    return pathLang as keyof typeof translations;
  }
  
  // 브라우저 언어 설정 확인
  const browserLang = navigator.language.split('-')[0];
  if (browserLang in translations) {
    return browserLang as keyof typeof translations;
  }
  
  // 기본값: 한국어
  return 'ko';
};

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
  const [language, setLanguage] = useState<keyof typeof translations>('ko');

  useEffect(() => {
    // 언어 감지
    setLanguage(detectLanguage());

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
            language: language,
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
  }, [error, language]);

  const t = translations[language];

  return (
    <html lang={language}>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-red-50">
          <div className="max-w-md">
            {/* 심각한 에러임을 나타내는 아이콘 */}
            <div className="text-6xl mb-6">🚨</div>
            
            <h1 className="text-3xl font-bold mb-4 text-red-800">
              {t.title}
            </h1>
            
            <p className="text-red-700 mb-6">
              {t.description}
            </p>
            
            {error.digest && (
              <div className="mb-6 p-3 bg-red-100 rounded-lg">
                <p className="text-xs text-red-600 font-mono">
                  {t.errorId}: {error.digest}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  {t.reportNote}
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              <button
                onClick={reset}
                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {t.restartButton}
              </button>
              
              <button
                onClick={() => {
                  // 페이지 새로고침으로 완전 초기화
                  window.location.reload();
                }}
                className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                {t.refreshButton}
              </button>
            </div>

            {/* 개발 환경에서만 상세 에러 정보 표시 */}
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-red-600 cursor-pointer">
                  {t.developerInfo}
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
                  {t.reportTitle}
                </p>
                <a
                  href={`mailto:support@picnic.com?subject=Global Error Report&body=Error ID: ${error.digest || 'N/A'}%0ATime: ${new Date().toISOString()}%0AUser Agent: ${encodeURIComponent(navigator.userAgent)}`}
                  className="text-sm text-red-700 underline hover:text-red-800"
                >
                  {t.contactAdmin}
                </a>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}