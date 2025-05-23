import { create } from 'zustand';

// 오류 유형 정의
export type ErrorType = 'network' | 'auth' | 'validation' | 'notFound' | 'server' | 'unknown';

// 오류 상태 인터페이스
interface ErrorState {
  error: Error | null;
  errorType: ErrorType | null;
  errorMessage: string | null;
  setError: (error: Error | null, type?: ErrorType, message?: string) => void;
  clearError: () => void;
}

/**
 * 애플리케이션 오류를 관리하는 스토어
 * 
 * 모든 오류 관련 상태와 작업을 중앙에서 관리합니다.
 */
export const useErrorStore = create<ErrorState>((set) => ({
  error: null,
  errorType: null,
  errorMessage: null,
  
  // 오류 설정 함수
  setError: (error: Error | null, type: ErrorType = 'unknown', message?: string) => set({
    error,
    errorType: type,
    errorMessage: message || (error ? error.message : null)
  }),
  
  // 오류 초기화 함수
  clearError: () => set({
    error: null,
    errorType: null,
    errorMessage: null
  })
}));

// 사용자 친화적인 오류 메시지 헬퍼 함수
export const getErrorMessage = (type: ErrorType): string => {
  switch (type) {
    case 'network':
      return '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.';
    case 'auth':
      return '인증에 실패했습니다. 로그인 정보를 확인해주세요.';
    case 'validation':
      return '입력한 정보가 올바르지 않습니다. 다시 확인해주세요.';
    case 'notFound':
      return '요청하신 정보를 찾을 수 없습니다.';
    case 'server':
      return '서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'unknown':
    default:
      return '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
};

export default useErrorStore; 