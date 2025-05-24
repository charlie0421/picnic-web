/**
 * stores/errorStore.ts 테스트
 *
 * 이 테스트는 오류 상태 관리 스토어를 검증합니다.
 * 테스트 대상: useErrorStore, getErrorMessage 함수
 */

import { renderHook, act } from '@testing-library/react';
import { useErrorStore, getErrorMessage, ErrorType } from '@/stores/errorStore';

describe('errorStore', () => {
  beforeEach(() => {
    // 각 테스트 전에 스토어 초기화
    act(() => {
      useErrorStore.getState().clearError();
    });
  });

  describe('useErrorStore', () => {
    it('초기 상태가 올바르게 설정된다', () => {
      const { result } = renderHook(() => useErrorStore());

      expect(result.current.error).toBeNull();
      expect(result.current.errorType).toBeNull();
      expect(result.current.errorMessage).toBeNull();
    });

    it('setError로 오류를 설정할 수 있다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Test error');

      act(() => {
        result.current.setError(testError, 'network', 'Custom message');
      });

      expect(result.current.error).toBe(testError);
      expect(result.current.errorType).toBe('network');
      expect(result.current.errorMessage).toBe('Custom message');
    });

    it('setError에서 메시지를 제공하지 않으면 Error.message를 사용한다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Error message from Error object');

      act(() => {
        result.current.setError(testError, 'auth');
      });

      expect(result.current.error).toBe(testError);
      expect(result.current.errorType).toBe('auth');
      expect(result.current.errorMessage).toBe('Error message from Error object');
    });

    it('setError에서 타입을 제공하지 않으면 unknown을 기본값으로 사용한다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Test error');

      act(() => {
        result.current.setError(testError);
      });

      expect(result.current.error).toBe(testError);
      expect(result.current.errorType).toBe('unknown');
      expect(result.current.errorMessage).toBe('Test error');
    });

    it('setError에 null을 전달하면 오류가 초기화된다', () => {
      const { result } = renderHook(() => useErrorStore());
      
      // 먼저 오류 설정
      act(() => {
        result.current.setError(new Error('Test error'), 'network');
      });

      // null로 초기화
      act(() => {
        result.current.setError(null);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.errorType).toBe('unknown');
      expect(result.current.errorMessage).toBeNull();
    });

    it('clearError로 모든 오류 상태를 초기화할 수 있다', () => {
      const { result } = renderHook(() => useErrorStore());
      
      // 먼저 오류 설정
      act(() => {
        result.current.setError(new Error('Test error'), 'validation', 'Custom message');
      });

      // 초기화
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.errorType).toBeNull();
      expect(result.current.errorMessage).toBeNull();
    });

    it('여러 번 setError를 호출하면 마지막 값으로 업데이트된다', () => {
      const { result } = renderHook(() => useErrorStore());
      
      const firstError = new Error('First error');
      const secondError = new Error('Second error');

      act(() => {
        result.current.setError(firstError, 'network', 'First message');
      });

      act(() => {
        result.current.setError(secondError, 'auth', 'Second message');
      });

      expect(result.current.error).toBe(secondError);
      expect(result.current.errorType).toBe('auth');
      expect(result.current.errorMessage).toBe('Second message');
    });

    it('다양한 ErrorType을 올바르게 처리한다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Test error');
      
      const errorTypes: ErrorType[] = ['network', 'auth', 'validation', 'notFound', 'server', 'unknown'];

      errorTypes.forEach((type) => {
        act(() => {
          result.current.setError(testError, type);
        });

        expect(result.current.errorType).toBe(type);
      });
    });

    it('빈 문자열 메시지를 올바르게 처리한다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Test error');

      act(() => {
        result.current.setError(testError, 'network', '');
      });

      // 빈 문자열은 falsy이므로 Error.message를 사용
      expect(result.current.errorMessage).toBe('Test error');
    });

    it('undefined 메시지를 올바르게 처리한다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Error from object');

      act(() => {
        result.current.setError(testError, 'network', undefined);
      });

      expect(result.current.errorMessage).toBe('Error from object');
    });
  });

  describe('getErrorMessage', () => {
    it('network 타입에 대한 올바른 메시지를 반환한다', () => {
      const message = getErrorMessage('network');
      expect(message).toBe('네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.');
    });

    it('auth 타입에 대한 올바른 메시지를 반환한다', () => {
      const message = getErrorMessage('auth');
      expect(message).toBe('인증에 실패했습니다. 로그인 정보를 확인해주세요.');
    });

    it('validation 타입에 대한 올바른 메시지를 반환한다', () => {
      const message = getErrorMessage('validation');
      expect(message).toBe('입력한 정보가 올바르지 않습니다. 다시 확인해주세요.');
    });

    it('notFound 타입에 대한 올바른 메시지를 반환한다', () => {
      const message = getErrorMessage('notFound');
      expect(message).toBe('요청하신 정보를 찾을 수 없습니다.');
    });

    it('server 타입에 대한 올바른 메시지를 반환한다', () => {
      const message = getErrorMessage('server');
      expect(message).toBe('서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
    });

    it('unknown 타입에 대한 올바른 메시지를 반환한다', () => {
      const message = getErrorMessage('unknown');
      expect(message).toBe('알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    });

    it('모든 ErrorType에 대해 문자열을 반환한다', () => {
      const errorTypes: ErrorType[] = ['network', 'auth', 'validation', 'notFound', 'server', 'unknown'];
      
      errorTypes.forEach((type) => {
        const message = getErrorMessage(type);
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });

  describe('스토어 통합 테스트', () => {
    it('setError와 getErrorMessage를 함께 사용할 수 있다', () => {
      const { result } = renderHook(() => useErrorStore());
      const testError = new Error('Test error');

      act(() => {
        result.current.setError(testError, 'network');
      });

      const friendlyMessage = getErrorMessage(result.current.errorType!);
      expect(friendlyMessage).toBe('네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.');
    });

    it('여러 컴포넌트에서 동일한 스토어 상태를 공유한다', () => {
      const { result: result1 } = renderHook(() => useErrorStore());
      const { result: result2 } = renderHook(() => useErrorStore());
      
      const testError = new Error('Shared error');

      act(() => {
        result1.current.setError(testError, 'auth', 'Shared message');
      });

      // 두 번째 훅에서도 동일한 상태를 확인
      expect(result2.current.error).toBe(testError);
      expect(result2.current.errorType).toBe('auth');
      expect(result2.current.errorMessage).toBe('Shared message');
    });

    it('한 곳에서 clearError를 호출하면 모든 곳에서 초기화된다', () => {
      const { result: result1 } = renderHook(() => useErrorStore());
      const { result: result2 } = renderHook(() => useErrorStore());
      
      // 첫 번째 훅에서 오류 설정
      act(() => {
        result1.current.setError(new Error('Test error'), 'network');
      });

      // 두 번째 훅에서 초기화
      act(() => {
        result2.current.clearError();
      });

      // 첫 번째 훅에서도 초기화되었는지 확인
      expect(result1.current.error).toBeNull();
      expect(result1.current.errorType).toBeNull();
      expect(result1.current.errorMessage).toBeNull();
    });
  });
}); 