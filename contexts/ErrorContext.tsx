'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { logger } from '@/utils/logger';

// 에러 상태 타입 정의
export interface ErrorState {
  id: string;
  error: AppError;
  timestamp: Date;
  dismissed: boolean;
  autoHide: boolean;
  duration?: number;
}

export interface GlobalErrorState {
  errors: ErrorState[];
  isLoading: boolean;
  lastError: ErrorState | null;
}

// 액션 타입 정의
type ErrorAction =
  | { type: 'ADD_ERROR'; payload: { error: AppError; autoHide?: boolean; duration?: number } }
  | { type: 'DISMISS_ERROR'; payload: { id: string } }
  | { type: 'CLEAR_ALL_ERRORS' }
  | { type: 'CLEAR_DISMISSED_ERRORS' }
  | { type: 'SET_LOADING'; payload: { isLoading: boolean } }
  | { type: 'AUTO_DISMISS_ERROR'; payload: { id: string } };

// 초기 상태
const initialState: GlobalErrorState = {
  errors: [],
  isLoading: false,
  lastError: null,
};

// 리듀서 함수
function errorReducer(state: GlobalErrorState, action: ErrorAction): GlobalErrorState {
  switch (action.type) {
    case 'ADD_ERROR': {
      const { error, autoHide = true, duration = 5000 } = action.payload;
      const id = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const newErrorState: ErrorState = {
        id,
        error,
        timestamp: new Date(),
        dismissed: false,
        autoHide,
        duration,
      };

      // 중복 에러 방지 (같은 메시지의 에러가 이미 있으면 추가하지 않음)
      const isDuplicate = state.errors.some(
        existingError => 
          !existingError.dismissed && 
          existingError.error.message === error.message &&
          Date.now() - existingError.timestamp.getTime() < 1000 // 1초 내 중복 방지
      );

      if (isDuplicate) {
        return state;
      }

      return {
        ...state,
        errors: [...state.errors, newErrorState],
        lastError: newErrorState,
      };
    }

    case 'DISMISS_ERROR': {
      return {
        ...state,
        errors: state.errors.map(error =>
          error.id === action.payload.id
            ? { ...error, dismissed: true }
            : error
        ),
      };
    }

    case 'AUTO_DISMISS_ERROR': {
      return {
        ...state,
        errors: state.errors.map(error =>
          error.id === action.payload.id
            ? { ...error, dismissed: true }
            : error
        ),
      };
    }

    case 'CLEAR_ALL_ERRORS': {
      return {
        ...state,
        errors: [],
        lastError: null,
      };
    }

    case 'CLEAR_DISMISSED_ERRORS': {
      const activeErrors = state.errors.filter(error => !error.dismissed);
      return {
        ...state,
        errors: activeErrors,
        lastError: activeErrors.length > 0 ? activeErrors[activeErrors.length - 1] : null,
      };
    }

    case 'SET_LOADING': {
      return {
        ...state,
        isLoading: action.payload.isLoading,
      };
    }

    default:
      return state;
  }
}

// Context 타입 정의
interface ErrorContextType {
  state: GlobalErrorState;
  addError: (error: AppError | Error | string, options?: { autoHide?: boolean; duration?: number }) => string;
  dismissError: (id: string) => void;
  clearAllErrors: () => void;
  clearDismissedErrors: () => void;
  setLoading: (isLoading: boolean) => void;
  // 편의 메서드들
  showError: (message: string, category?: ErrorCategory, severity?: ErrorSeverity) => string;
  showNetworkError: (message?: string) => string;
  showValidationError: (message: string) => string;
  showServerError: (message?: string) => string;
  // 상태 조회 메서드들
  getActiveErrors: () => ErrorState[];
  getErrorsByCategory: (category: ErrorCategory) => ErrorState[];
  getErrorsBySeverity: (severity: ErrorSeverity) => ErrorState[];
  hasErrors: () => boolean;
  hasErrorsOfCategory: (category: ErrorCategory) => boolean;
}

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
        ErrorSeverity.ERROR,
        { originalError: errorInput }
      );
    } else {
      appError = new AppError(
        errorInput,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.ERROR
      );
    }

    // 로깅
    logger.error('Error added to context', {
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