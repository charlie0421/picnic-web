'use client';

import React, { useState, useEffect } from 'react';
import { useErrorState, useError } from '@/contexts/ErrorContext';
import { ErrorCategory, ErrorSeverity } from '@/utils/error';
import { X, AlertCircle, AlertTriangle, Info, Wifi, WifiOff } from 'lucide-react';

interface ErrorDisplayProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxVisible?: number;
  showNetworkStatus?: boolean;
}

/**
 * 글로벌 에러 표시 컴포넌트
 * 
 * 애플리케이션 전체의 에러 상태를 사용자에게 표시합니다.
 * 다양한 에러 카테고리와 심각도에 따라 다른 스타일을 적용합니다.
 */
export function GlobalErrorDisplay({ 
  position = 'top-right',
  maxVisible = 5,
  showNetworkStatus = true
}: ErrorDisplayProps) {
  const { activeErrors, hasNetworkErrors } = useErrorState();
  const { dismissError } = useError();
  const [isOnline, setIsOnline] = useState(true);

  // 네트워크 상태 모니터링
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);

      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // 표시할 에러들 (최대 개수 제한)
  const visibleErrors = activeErrors.slice(0, maxVisible);

  // 포지션에 따른 CSS 클래스
  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-center':
        return 'top-4 left-1/2 transform -translate-x-1/2';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 transform -translate-x-1/2';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  };

  // 에러 카테고리에 따른 아이콘
  const getErrorIcon = (category: ErrorCategory, severity: ErrorSeverity) => {
    if (category === ErrorCategory.NETWORK) {
      return <WifiOff className="w-5 h-5" />;
    }

    switch (severity) {
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return <AlertCircle className="w-5 h-5" />;
      case ErrorSeverity.MEDIUM:
        return <AlertTriangle className="w-5 h-5" />;
      case ErrorSeverity.LOW:
        return <Info className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  // 에러 심각도에 따른 스타일
  const getErrorStyles = (category: ErrorCategory, severity: ErrorSeverity) => {
    if (category === ErrorCategory.NETWORK) {
      return 'bg-orange-50 border-orange-200 text-orange-800';
    }

    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'bg-red-50 border-red-200 text-red-800';
      case ErrorSeverity.HIGH:
        return 'bg-red-50 border-red-200 text-red-700';
      case ErrorSeverity.MEDIUM:
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case ErrorSeverity.LOW:
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  // 에러 메시지 단축
  const truncateMessage = (message: string, maxLength = 100) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  if (visibleErrors.length === 0 && (!showNetworkStatus || isOnline)) {
    return null;
  }

  return (
    <div className={`fixed z-50 ${getPositionClasses()} max-w-sm w-full space-y-2`}>
      {/* 네트워크 상태 표시 */}
      {showNetworkStatus && !isOnline && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
          <div className="flex items-start">
            <WifiOff className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                인터넷 연결 끊김
              </p>
              <p className="text-xs text-red-600 mt-1">
                네트워크 연결을 확인해주세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 에러 목록 */}
      {visibleErrors.map((errorState) => (
        <div
          key={errorState.id}
          className={`border rounded-lg p-4 shadow-lg transition-all duration-300 ${getErrorStyles(
            errorState.error.category,
            errorState.error.severity
          )}`}
        >
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-3 mt-0.5">
              {getErrorIcon(errorState.error.category, errorState.error.severity)}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {truncateMessage(errorState.error.message)}
              </p>
              
              {/* 에러 세부 정보 (개발 환경에서만) */}
              {process.env.NODE_ENV === 'development' && errorState.error.details && (
                <p className="text-xs mt-1 opacity-75">
                  {truncateMessage(errorState.error.details, 80)}
                </p>
              )}
              
              {/* 타임스탬프 */}
              <p className="text-xs mt-1 opacity-60">
                {errorState.timestamp.toLocaleTimeString()}
              </p>
            </div>
            
            {/* 닫기 버튼 */}
            <button
              onClick={() => dismissError(errorState.id)}
              className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-black hover:bg-opacity-10 transition-colors"
              aria-label="에러 메시지 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {/* 더 많은 에러가 있을 때 표시 */}
      {activeErrors.length > maxVisible && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-600">
            +{activeErrors.length - maxVisible}개의 추가 에러
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 간단한 토스트 스타일 에러 표시 컴포넌트
 */
export function ErrorToast() {
  return (
    <GlobalErrorDisplay 
      position="top-right" 
      maxVisible={3}
      showNetworkStatus={true}
    />
  );
}

/**
 * 하단 고정 에러 바 컴포넌트
 */
export function ErrorBar() {
  const { activeErrors, hasErrors } = useErrorState();
  const { dismissError, clearAllErrors } = useError();

  if (!hasErrors) return null;

  const latestError = activeErrors[activeErrors.length - 1];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-red-600 text-white p-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {latestError?.error.message}
            </p>
            {activeErrors.length > 1 && (
              <p className="text-xs opacity-90">
                총 {activeErrors.length}개의 에러
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {activeErrors.length > 1 && (
            <button
              onClick={clearAllErrors}
              className="text-xs bg-red-700 hover:bg-red-800 px-2 py-1 rounded transition-colors"
            >
              모두 지우기
            </button>
          )}
          <button
            onClick={() => latestError && dismissError(latestError.id)}
            className="p-1 hover:bg-red-700 rounded transition-colors"
            aria-label="에러 메시지 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
} 