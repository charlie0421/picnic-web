'use client';

import { AppError, ErrorSeverity } from '@/utils/error';

/**
 * 기본 에러 Fallback UI 컴포넌트 Props
 */
export interface DefaultErrorFallbackProps {
  error: AppError;
  retry: () => void;
  level?: 'page' | 'section' | 'component';
  enableRetry?: boolean;
  retryCount: number;
  maxRetries: number;
  isRetrying: boolean;
}

/**
 * 기본 에러 Fallback UI 컴포넌트
 */
export function DefaultErrorFallback({
  error,
  retry,
  level = 'component',
  enableRetry = true,
  retryCount,
  maxRetries,
  isRetrying
}: DefaultErrorFallbackProps) {
  const canRetry = enableRetry && retryCount < maxRetries;

  const getErrorIcon = () => {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return '🚨';
      case ErrorSeverity.MEDIUM:
        return '⚠️';
      case ErrorSeverity.LOW:
        return 'ℹ️';
      default:
        return '❌';
    }
  };

  const getContainerClasses = () => {
    switch (level) {
      case 'page':
        return 'min-h-screen flex items-center justify-center bg-gray-50';
      case 'section':
        return 'min-h-[400px] flex items-center justify-center bg-gray-50 rounded-lg';
      case 'component':
        return 'min-h-[200px] flex items-center justify-center bg-gray-50 rounded border';
      default:
        return 'min-h-[200px] flex items-center justify-center bg-gray-50 rounded';
    }
  };

  const getContentClasses = () => {
    switch (level) {
      case 'page':
        return 'text-center max-w-md';
      case 'section':
        return 'text-center max-w-sm';
      default:
        return 'text-center max-w-xs';
    }
  };

  return (
    <div className={getContainerClasses()}>
      <div className={getContentClasses()}>
        <div className="text-4xl mb-4">{getErrorIcon()}</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          {level === 'page' ? '페이지 오류' : '오류가 발생했습니다'}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {error.toUserMessage()}
        </p>
        {error.isRetryable && (
          <div className="space-y-2">
            <button
              onClick={retry}
              disabled={isRetrying}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRetrying ? '재시도 중...' : `다시 시도 (${retryCount}/${maxRetries})`}
            </button>
          </div>
        )}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 text-left">
            <summary className="text-xs text-gray-500 cursor-pointer">
              개발자 정보
            </summary>
            <pre className="text-xs text-gray-400 mt-2 overflow-auto">
              {JSON.stringify(error.toLogData(), null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
