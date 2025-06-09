'use client';

import React, { Component, ReactNode } from 'react';
import { AppError, ErrorCategory, ErrorSeverity, ErrorHandler, createContext } from '@/utils/error';

// 글로벌 에러 컨텍스트 타입 (런타임에서 사용)
interface GlobalErrorHandler {
  addError?: (error: AppError | Error | string, options?: { autoHide?: boolean; duration?: number }) => string;
}

// 글로벌 에러 핸들러 참조 (Context 외부에서 접근 가능)
let globalErrorHandler: GlobalErrorHandler = {};

// 글로벌 에러 핸들러 등록 함수
export function registerGlobalErrorHandler(handler: GlobalErrorHandler) {
  globalErrorHandler = handler;
}

/**
 * 에러 바운더리 Props 인터페이스
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: AppError, retry: () => void) => ReactNode;
  onError?: (error: AppError) => void;
  level?: 'page' | 'section' | 'component';
  identifier?: string;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  propagateToGlobal?: boolean; // 글로벌 에러 상태로 전파할지 여부
}

/**
 * 에러 바운더리 State 인터페이스
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorId: string | null;
  retryCount: number;
  isRetrying: boolean;
}

/**
 * 기본 에러 Fallback UI 컴포넌트
 */
function DefaultErrorFallback({ 
  error, 
  retry, 
  level = 'component',
  enableRetry = true,
  retryCount,
  maxRetries,
  isRetrying
}: { 
  error: AppError; 
  retry: () => void; 
  level?: 'page' | 'section' | 'component';
  enableRetry?: boolean;
  retryCount: number;
  maxRetries: number;
  isRetrying: boolean;
}) {
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

/**
 * React Error Boundary 컴포넌트
 * 
 * 중앙화된 에러 핸들링 시스템과 통합된 에러 바운더리입니다.
 * Next.js App Router와 호환되며, 다양한 레벨에서 사용할 수 있습니다.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // 에러 ID 생성 (디버깅용)
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      errorId,
    };
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try {
      // 에러 컨텍스트 생성
      const context = createContext()
        .setUrl(typeof window !== 'undefined' ? window.location.href : '')
        .setUserAgent(typeof window !== 'undefined' ? window.navigator.userAgent : '')
        .setAdditionalData({
          componentStack: errorInfo.componentStack,
          errorBoundary: this.props.identifier || 'unknown',
          level: this.props.level || 'component',
          errorId: this.state.errorId,
          retryCount: this.state.retryCount,
        })
        .build();

      // 중앙화된 에러 핸들러로 처리
      const appError = await ErrorHandler.handle(error, context);
      
      this.setState({ error: appError });

      // 글로벌 에러 상태로 전파 (옵션이 활성화된 경우)
      if (this.props.propagateToGlobal !== false && globalErrorHandler.addError) {
        const shouldAutoHide = this.props.level !== 'page'; // 페이지 레벨 에러는 자동 숨김 안함
        const duration = this.props.level === 'page' ? undefined : 8000; // 페이지 에러는 수동 해제
        
        globalErrorHandler.addError(appError, {
          autoHide: shouldAutoHide,
          duration: duration,
        });
      }

      // 사용자 정의 에러 핸들러 호출
      this.props.onError?.(appError);

    } catch (handlingError) {
      console.error('에러 바운더리에서 에러 처리 중 오류:', handlingError);
      
      // 폴백 에러 생성
      const fallbackError = new AppError(
        error.message || '알 수 없는 오류가 발생했습니다.',
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500,
        { originalError: error }
      );
      
      this.setState({ error: fallbackError });

      // 폴백 에러도 글로벌로 전파
      if (this.props.propagateToGlobal !== false && globalErrorHandler.addError) {
        globalErrorHandler.addError(fallbackError);
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  /**
   * 에러 상태 초기화 및 재시도
   */
  handleRetry = () => {
    // 빠른 연속 재시도 방지
    if (this.retryTimeoutId) {
      return;
    }

    // 최대 재시도 횟수 확인 (3회)
    if (this.state.retryCount >= 3) {
      console.warn('최대 재시도 횟수에 도달했습니다.');
      return;
    }

    // 재시도 간격 계산 (지수 백오프)
    const retryDelay = Math.min(1000 * Math.pow(2, this.state.retryCount), 8000);

    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: prevState.retryCount + 1,
      isRetrying: true,
    }));

    // 지연 후에 재시도 가능하도록 설정
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null;
    }, retryDelay);
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // 사용자 정의 Fallback UI가 있으면 사용
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      // 기본 Fallback UI 사용
      return (
        <DefaultErrorFallback
          error={this.state.error}
          retry={this.handleRetry}
          level={this.props.level}
          enableRetry={this.props.enableRetry}
          retryCount={this.state.retryCount}
          maxRetries={this.props.maxRetries || 3}
          isRetrying={this.state.isRetrying}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * 페이지 레벨 에러 바운더리 컴포넌트
 */
export function PageErrorBoundary({ 
  children, 
  fallback,
  onError,
  identifier 
}: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary
      level="page"
      fallback={fallback}
      onError={onError}
      identifier={identifier}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * 섹션 레벨 에러 바운더리 컴포넌트
 */
export function SectionErrorBoundary({ 
  children, 
  fallback,
  onError,
  identifier 
}: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary
      level="section"
      fallback={fallback}
      onError={onError}
      identifier={identifier}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * 컴포넌트 레벨 에러 바운더리 컴포넌트
 */
export function ComponentErrorBoundary({ 
  children, 
  fallback,
  onError,
  identifier 
}: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary
      level="component"
      fallback={fallback}
      onError={onError}
      identifier={identifier}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * 비동기 컴포넌트용 에러 바운더리 HOC
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary; 