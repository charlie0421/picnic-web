/**
 * Next.js Navigation 모듈 모킹
 * 
 * Next.js App Router의 navigation 관련 함수들에 대한 모의 구현을 제공합니다.
 */

// 기본 라우터 상태
const defaultRouterState = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(() => Promise.resolve()),
  pathname: '/',
  isFallback: false,
  query: {},
  asPath: '/',
  isReady: true,
  events: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },
};

// 사용자 정의 라우터 상태 (테스트별로 설정 가능)
let routerState = { ...defaultRouterState };

// 라우터 상태 재설정 함수
const resetRouterState = () => {
  routerState = { ...defaultRouterState };
  
  // 모든 모의 함수 재설정
  Object.keys(routerState).forEach(key => {
    if (typeof routerState[key] === 'function' && routerState[key].mockClear) {
      routerState[key].mockClear();
    }
  });
};

// useRouter 훅
export const useRouter = jest.fn(() => routerState);

// usePathname 훅
export const usePathname = jest.fn(() => '/');

// useSearchParams 훅
export const useSearchParams = jest.fn(() => new URLSearchParams());

// useParams 훅
export const useParams = jest.fn(() => ({}));

// notFound 함수
export const notFound = jest.fn(() => {
  throw new Error('Not Found');
});

// redirect 함수
export const redirect = jest.fn(() => {
  throw new Error('Redirect');
});

// 테스트에서 사용할 수 있는 유틸리티 함수들
export const __testUtils = {
  resetRouterState,
  setRouterState: (newState) => {
    routerState = { ...routerState, ...newState };
  },
  setPathname: (pathname) => {
    usePathname.mockReturnValue(pathname);
  },
  setSearchParams: (params) => {
    useSearchParams.mockReturnValue(new URLSearchParams(params));
  },
  setParams: (params) => {
    useParams.mockReturnValue(params);
  },
}; 