'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import {
  errorReducer,
  initialState,
  type ErrorState,
  type GlobalErrorState,
  type ErrorContextType,
} from './error-context-reducer';

// Re-export types so existing consumers don't break
export type { ErrorState, GlobalErrorState, ErrorContextType };

// Context 생성
const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

// Provider 컴포넌트
interface ErrorProviderProps {
  children: React.ReactNode;
  maxErrors?: number; // 최대 에러 개수 (기본값: 10)
  defaultAutoHide?: boolean; // 기본 자동 숨김 설정
  defaultDuration?: number; // 기본 표시 시간 (ms)
}

export function ErrorProvider({ 
  children, 
  maxErrors = 10,
  defaultAutoHide = true,
  defaultDuration = 5000 
}: ErrorProviderProps) {
  const [state, dispatch] = useReducer(errorReducer, initialState);

  // 자동 에러 해제를 위한 타이머 관리
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    state.errors.forEach(errorState => {
      if (errorState.autoHide && !errorState.dismissed && errorState.duration) {
        const timer = setTimeout(() => {
          dispatch({ type: 'AUTO_DISMISS_ERROR', payload: { id: errorState.id } });
        }, errorState.duration);
        
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [state.errors]);

  // 최대 에러 개수 제한
  useEffect(() => {
    if (state.errors.length > maxErrors) {
      const excessCount = state.errors.length - maxErrors;
      const oldestErrors = state.errors.slice(0, excessCount);
      
      oldestErrors.forEach(error => {
        dispatch({ type: 'DISMISS_ERROR', payload: { id: error.id } });
      });
    }
  }, [state.errors.length, maxErrors]);

  // 에러 추가 함수
  const addError = useCallback((
    errorInput: AppError | Error | string,
    options: { autoHide?: boolean; duration?: number } = {}
  ): string => {
    let appError: AppError;

    if (errorInput instanceof AppError) {
      appError = errorInput;
    } else if (errorInput instanceof Error) {
      appError = new AppError(
        errorInput.message,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500,
        { originalError: errorInput }
      );
    } else {
      appError = new AppError(
        errorInput,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500
      );
    }

    // 로깅
    console.log('Error added to context:', {
      message: appError.message,
      category: appError.category,
      severity: appError.severity,
      context: appError.context,
    });

    const id = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    dispatch({
      type: 'ADD_ERROR',
      payload: {
        error: appError,
        autoHide: options.autoHide ?? defaultAutoHide,
        duration: options.duration ?? defaultDuration,
      },
    });

    return id;
  }, [defaultAutoHide, defaultDuration]);

  // 에러 해제 함수
  const dismissError = useCallback((id: string) => {
    dispatch({ type: 'DISMISS_ERROR', payload: { id } });
  }, []);

  // 모든 에러 클리어
  const clearAllErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_ERRORS' });
  }, []);

  // 해제된 에러들만 클리어
  const clearDismissedErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_DISMISSED_ERRORS' });
  }, []);

  // 로딩 상태 설정
  const setLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: { isLoading } });
  }, []);

  // 편의 메서드들
  const showError = useCallback((
    message: string, 
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): string => {
    const error = new AppError(message, category, severity);
    return addError(error);
  }, [addError]);

  const showNetworkError = useCallback((message = '네트워크 연결을 확인해주세요.'): string => {
    return showError(message, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM);
  }, [showError]);

  const showValidationError = useCallback((message: string): string => {
    return showError(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW);
  }, [showError]);

  const showServerError = useCallback((message = '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'): string => {
    return showError(message, ErrorCategory.SERVER, ErrorSeverity.HIGH);
  }, [showError]);

  // 상태 조회 메서드들
  const getActiveErrors = useCallback((): ErrorState[] => {
    return state.errors.filter(error => !error.dismissed);
  }, [state.errors]);

  const getErrorsByCategory = useCallback((category: ErrorCategory): ErrorState[] => {
    return state.errors.filter(error => !error.dismissed && error.error.category === category);
  }, [state.errors]);

  const getErrorsBySeverity = useCallback((severity: ErrorSeverity): ErrorState[] => {
    return state.errors.filter(error => !error.dismissed && error.error.severity === severity);
  }, [state.errors]);

  const hasErrors = useCallback((): boolean => {
    return state.errors.some(error => !error.dismissed);
  }, [state.errors]);

  const hasErrorsOfCategory = useCallback((category: ErrorCategory): boolean => {
    return state.errors.some(error => !error.dismissed && error.error.category === category);
  }, [state.errors]);

  const contextValue: ErrorContextType = {
    state,
    addError,
    dismissError,
    clearAllErrors,
    clearDismissedErrors,
    setLoading,
    showError,
    showNetworkError,
    showValidationError,
    showServerError,
    getActiveErrors,
    getErrorsByCategory,
    getErrorsBySeverity,
    hasErrors,
    hasErrorsOfCategory,
  };

  return (
    <ErrorContext.Provider value={contextValue}>
      {children}
    </ErrorContext.Provider>
  );
}

// Hook for using the error context
export function useError(): ErrorContextType {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}

// 편의 훅들
export function useErrorHandler() {
  const { addError, showError, showNetworkError, showValidationError, showServerError } = useError();
  
  return {
    handleError: addError,
    showError,
    showNetworkError,
    showValidationError,
    showServerError,
  };
}

export function useErrorState() {
  const { state, getActiveErrors, hasErrors, hasErrorsOfCategory } = useError();
  
  return {
    errors: state.errors,
    activeErrors: getActiveErrors(),
    isLoading: state.isLoading,
    lastError: state.lastError,
    hasErrors: hasErrors(),
    hasNetworkErrors: hasErrorsOfCategory(ErrorCategory.NETWORK),
    hasValidationErrors: hasErrorsOfCategory(ErrorCategory.VALIDATION),
    hasServerErrors: hasErrorsOfCategory(ErrorCategory.SERVER),
  };
} 