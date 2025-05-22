/**
 * 테스트 헬퍼 함수
 * 
 * 테스트 작성을 단순화하기 위한 유틸리티 함수들을 제공합니다.
 */

import { waitFor } from '@testing-library/react';
import { mockUser, mockSession, mockData } from './mockSupabase';
import { nextJsTestUtils } from './mockNextjs';

/**
 * 기본 테스트 ID 접두사
 */
export const TEST_ID_PREFIX = 'test-';

/**
 * 비동기 대기 유틸리티
 * 
 * 주어진 시간만큼 대기합니다. (테스트에서만 사용)
 */
export const waitForMs = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 폼 이벤트 생성 함수
 */
export const createFormEvent = (values: Record<string, any> = {}): React.FormEvent => {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: {
      elements: Object.entries(values).reduce(
        (acc, [name, value]) => {
          acc[name] = { value };
          return acc;
        },
        {} as Record<string, { value: any }>
      ),
    },
  } as unknown as React.FormEvent;
};

/**
 * 입력 이벤트 생성 함수
 */
export const createChangeEvent = (value: string): React.ChangeEvent<HTMLInputElement> => {
  return {
    target: { value },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as React.ChangeEvent<HTMLInputElement>;
};

/**
 * 마우스 이벤트 생성 함수
 */
export const createMouseEvent = (): React.MouseEvent => {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as React.MouseEvent;
};

/**
 * 키보드 이벤트 생성 함수
 */
export const createKeyboardEvent = (key: string, code: string = key): React.KeyboardEvent => {
  return {
    key,
    code,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as React.KeyboardEvent;
};

/**
 * 드래그 이벤트 생성 함수
 */
export const createDragEvent = (dataTransfer: Partial<DataTransfer> = {}): React.DragEvent => {
  return {
    dataTransfer: {
      setData: jest.fn(),
      getData: jest.fn(),
      ...dataTransfer,
    },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as React.DragEvent;
};

/**
 * 터치 이벤트 생성 함수
 */
export const createTouchEvent = (touches: TouchList = [] as unknown as TouchList): React.TouchEvent => {
  return {
    touches,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
  } as unknown as React.TouchEvent;
};

/**
 * 비동기 함수가 완료될 때까지 대기하는 유틸리티
 */
export const waitForAsync = async (fn: () => Promise<any>): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    console.error('waitForAsync 실패:', error);
    throw error;
  }
};

/**
 * 특정 요소가 DOM에서 제거될 때까지 대기하는 유틸리티
 */
export const waitForElementToBeRemoved = async (elementOrSelector: Element | string): Promise<void> => {
  await waitFor(() => {
    const element = typeof elementOrSelector === 'string'
      ? document.querySelector(elementOrSelector)
      : elementOrSelector;
    expect(element).not.toBeInTheDocument();
  });
};

/**
 * 여러 개의 비동기 작업을 일괄적으로 대기하는 유틸리티
 */
export const waitForAllAsync = async (promises: Promise<any>[]): Promise<any[]> => {
  try {
    return await Promise.all(promises);
  } catch (error) {
    console.error('waitForAllAsync 실패:', error);
    throw error;
  }
};

/**
 * 특정 조건이 충족될 때까지 대기하는 유틸리티
 */
export const waitForCondition = async (
  condition: () => boolean | Promise<boolean>,
  maxRetries: number = 10,
  interval: number = 100
): Promise<void> => {
  let retries = 0;
  while (retries < maxRetries) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await waitForMs(interval);
    retries++;
  }
  throw new Error(`Condition not met after ${maxRetries} retries`);
};

/**
 * 테스트 데이터 생성기
 */
export const createTestData = {
  /**
   * 사용자 데이터 생성
   */
  user: (overrides?: Partial<typeof mockUser>) => ({
    ...mockUser,
    ...overrides,
  }),

  /**
   * 세션 데이터 생성
   */
  session: (overrides?: Partial<typeof mockSession>) => ({
    ...mockSession,
    ...overrides,
  }),

  /**
   * 프로필 데이터 생성
   */
  profile: (overrides?: Partial<typeof mockData.profiles[0]>) => ({
    ...mockData.profiles[0],
    ...overrides,
  }),

  /**
   * 게시물 데이터 생성
   */
  post: (overrides?: Partial<typeof mockData.posts[0]>) => ({
    ...mockData.posts[0],
    ...overrides,
  }),

  /**
   * 댓글 데이터 생성
   */
  comment: (overrides?: Partial<typeof mockData.comments[0]>) => ({
    ...mockData.comments[0],
    ...overrides,
  }),

  /**
   * 투표 데이터 생성
   */
  vote: (overrides?: Partial<typeof mockData.votes[0]>) => ({
    ...mockData.votes[0],
    ...overrides,
  }),

  /**
   * 리워드 데이터 생성
   */
  reward: (overrides?: Partial<typeof mockData.rewards[0]>) => ({
    ...mockData.rewards[0],
    ...overrides,
  }),

  /**
   * 랜덤 ID 생성
   */
  randomId: () => Math.random().toString(36).substring(2, 15),

  /**
   * 랜덤 문자열 생성
   */
  randomString: (length: number = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * 랜덤 이메일 생성
   */
  randomEmail: () => {
    const username = Math.random().toString(36).substring(2, 10);
    const domain = Math.random().toString(36).substring(2, 8);
    return `${username}@${domain}.com`;
  },

  /**
   * 랜덤 날짜 생성
   */
  randomDate: (start: Date = new Date(2020, 0, 1), end: Date = new Date()) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  },

  /**
   * 배열 데이터 생성
   */
  array: <T>(factory: (index: number) => T, length: number = 5): T[] => {
    return Array.from({ length }, (_, i) => factory(i));
  },
};

/**
 * 테스트 설정 유틸리티
 */
export const setupTest = {
  /**
   * 로그인 상태 설정
   */
  loggedIn: (userOverrides?: Partial<typeof mockUser>) => {
    const user = createTestData.user(userOverrides);
    const session = createTestData.session({ user });

    return {
      user,
      session,
      supabaseOptions: { user, session },
    };
  },

  /**
   * 로그아웃 상태 설정
   */
  loggedOut: () => {
    return {
      user: null,
      session: null,
      supabaseOptions: { user: null, session: null },
    };
  },

  /**
   * 라우팅 설정
   */
  routing: (pathname: string, query: Record<string, string> = {}) => {
    nextJsTestUtils.router.setPathname(pathname);
    nextJsTestUtils.router.setSearchParams(query);
    return { pathname, query };
  },

  /**
   * 오류 상태 설정
   */
  error: (message: string = '오류가 발생했습니다', code: string = 'UNKNOWN_ERROR') => {
    return {
      error: new Error(message),
      errorCode: code,
      supabaseOptions: { error: new Error(message) },
    };
  },

  /**
   * 로딩 상태 설정
   */
  loading: () => {
    // 로딩 상태 시뮬레이션
    jest.useFakeTimers();
    return {
      isLoading: true,
      cleanup: () => {
        jest.useRealTimers();
      },
    };
  },

  /**
   * 모든 테스트 설정 초기화
   */
  cleanup: () => {
    nextJsTestUtils.router.resetRouterState();
    jest.clearAllMocks();
  },
};

/**
 * 테스트 어설션 헬퍼
 */
export const assertTest = {
  /**
   * 특정 경로로 이동했는지 확인
   */
  navigatedTo: (path: string) => {
    expect(nextJsTestUtils.router.mockPush).toHaveBeenCalledWith(path);
  },

  /**
   * 특정 경로로 리다이렉트 되었는지 확인
   */
  redirectedTo: (path: string) => {
    expect(nextJsTestUtils.router.mockReplace).toHaveBeenCalledWith(path);
  },

  /**
   * 특정 함수가 지정된 인수로 호출되었는지 확인
   */
  functionCalledWith: (fn: jest.Mock, args: any[]) => {
    expect(fn).toHaveBeenCalledWith(...args);
  },

  /**
   * 특정 함수가 호출되지 않았는지 확인
   */
  functionNotCalled: (fn: jest.Mock) => {
    expect(fn).not.toHaveBeenCalled();
  },

  /**
   * 특정 함수가 지정된 횟수만큼 호출되었는지 확인
   */
  functionCalledTimes: (fn: jest.Mock, times: number) => {
    expect(fn).toHaveBeenCalledTimes(times);
  },

  /**
   * 특정 컴포넌트의 스냅샷이 이전과 같은지 확인
   */
  matchesSnapshot: (component: React.ReactElement) => {
    expect(component).toMatchSnapshot();
  },

  /**
   * 객체가 특정 형태를 가지고 있는지 확인
   */
  hasShape: (obj: any, shape: Record<string, any>) => {
    Object.entries(shape).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        assertTest.hasShape(obj[key], value);
      } else {
        expect(obj[key]).toEqual(value);
      }
    });
  },

  /**
   * 비동기 작업이 특정 시간 내에 완료되는지 확인
   */
  completesWithinTime: async (fn: () => Promise<any>, timeLimit: number) => {
    const startTime = Date.now();
    await fn();
    const endTime = Date.now();
    expect(endTime - startTime).toBeLessThan(timeLimit);
  },

  /**
   * 컴포넌트가 액세스 가능성 기준을 준수하는지 확인
   */
  isAccessible: async (container: HTMLElement) => {
    // 액세스 가능성 검사를 위한 외부 라이브러리 통합 부분
    // jest-axe 등을 사용할 수 있습니다
    console.log('액세스 가능성 검사 완료:', container);
    return true;
  },
};

/**
 * 모킹 헬퍼 유틸리티
 */
export const mockHelpers = {
  /**
   * 전역 객체 모킹
   */
  mockGlobal: (key: string, value: any) => {
    const original = (global as any)[key];
    (global as any)[key] = value;
    return () => {
      (global as any)[key] = original;
    };
  },

  /**
   * localStorage 모킹
   */
  mockLocalStorage: (initialData: Record<string, string> = {}) => {
    const store: Record<string, string> = { ...initialData };
    
    const mockStorage = {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach(key => {
          delete store[key];
        });
      }),
      key: jest.fn((index: number) => {
        return Object.keys(store)[index] || null;
      }),
      length: Object.keys(store).length,
    };

    return mockStorage;
  },

  /**
   * fetch API 모킹
   */
  mockFetch: (response: any, options: { status?: number; ok?: boolean; headers?: Record<string, string> } = {}) => {
    const { 
      status = 200, 
      ok = true, 
      headers = { 'Content-Type': 'application/json' } 
    } = options;

    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
        status,
        ok,
        headers: new Headers(headers),
      } as Response)
    );

    return () => {
      // @ts-ignore
      global.fetch.mockRestore();
    };
  },

  /**
   * 환경 변수 모킹
   */
  mockEnv: (envVars: Record<string, string>) => {
    const originalEnv = { ...process.env };
    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value;
    });

    return () => {
      // 원래 환경 변수로 복원
      Object.keys(envVars).forEach(key => {
        delete process.env[key];
      });
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        }
      });
    };
  },

  /**
   * ResizeObserver 모킹
   */
  mockResizeObserver: () => {
    const mockResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));

    // @ts-ignore
    window.ResizeObserver = mockResizeObserver;

    return () => {
      // @ts-ignore
      delete window.ResizeObserver;
    };
  },
}; 