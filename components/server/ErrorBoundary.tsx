'use client';

import React from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { ErrorCode, AppError, handleError } from '@/lib/supabase/error';
import ErrorState from './ErrorState';

interface ErrorBoundaryProps {
  error: Error;
  reset: () => void;
}

/**
 * 서버 컴포넌트용 에러 경계 컴포넌트
 * 
 * Next.js의 error.tsx 파일과 함께 사용됩니다.
 * App Router에서 route segment마다 error.tsx를 생성하여 사용할 수 있습니다.
 * 
 * @example
 * // app/[lang]/(main)/vote/error.tsx
 * import { ServerErrorBoundary } from '@/components/server';
 * export default ServerErrorBoundary;
 */
export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const { t } = useLanguageStore();
  
  // 에러를 애플리케이션 표준 에러로 변환
  const appError = error instanceof AppError ? error : handleError(error);
  
  // 로깅 추가
  React.useEffect(() => {
    console.error('서버 컴포넌트 에러:', error);
    // 여기에 Sentry 등의 에러 로깅 서비스를 추가할 수 있습니다.
  }, [error]);
  
  const { code } = appError;
  
  // 에러 유형에 따라 적절한 메시지와 상태 코드 표시
  let statusCode = appError.status || 500;
  let errorMessage = appError.toFriendlyMessage();
  
  switch (code) {
    case ErrorCode.NOT_FOUND:
      statusCode = 404;
      errorMessage = t('error_loading_page') || '요청한 데이터를 찾을 수 없습니다.';
      break;
    case ErrorCode.UNAUTHORIZED:
      statusCode = 401;
      errorMessage = t('dialog_content_login_required') || '로그인이 필요합니다.';
      break;
    case ErrorCode.FORBIDDEN:
      statusCode = 403;
      errorMessage = '접근 권한이 없습니다.';
      break;
    case ErrorCode.VALIDATION:
      statusCode = 400;
      errorMessage = t('error_invalid_data') || '입력값이 유효하지 않습니다.';
      break;
    case ErrorCode.NETWORK_ERROR:
      statusCode = 0;
      errorMessage = t('error_network_connection') || '네트워크 연결을 확인해주세요.';
      break;
    default:
      errorMessage = t('error.description') || '요청하신 페이지를 처리하는 중 문제가 발생했습니다.';
      break;
  }
  
  return (
    <div className="py-8">
      <ErrorState 
        message={errorMessage}
        code={statusCode}
        retryLabel={t('error.retryButton')}
        retryLink={undefined} // Link 대신 버튼 사용
      />
      <div className="mt-4 flex justify-center">
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 transition-colors"
        >
          {t('error.retryButton')}
        </button>
      </div>
    </div>
  );
} 