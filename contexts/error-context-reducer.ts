import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';

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
export type ErrorAction =
  | { type: 'ADD_ERROR'; payload: { error: AppError; autoHide?: boolean; duration?: number } }
  | { type: 'DISMISS_ERROR'; payload: { id: string } }
  | { type: 'CLEAR_ALL_ERRORS' }
  | { type: 'CLEAR_DISMISSED_ERRORS' }
  | { type: 'SET_LOADING'; payload: { isLoading: boolean } }
  | { type: 'AUTO_DISMISS_ERROR'; payload: { id: string } };

// 초기 상태
export const initialState: GlobalErrorState = {
  errors: [],
  isLoading: false,
  lastError: null,
};

// 리듀서 함수
export function errorReducer(state: GlobalErrorState, action: ErrorAction): GlobalErrorState {
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
export interface ErrorContextType {
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
