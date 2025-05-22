/**
 * Next.js Headers 모듈 모킹
 * 
 * Next.js App Router의 headers 관련 함수들에 대한 모의 구현을 제공합니다.
 */

// 기본 쿠키 저장소
const defaultCookieStore = new Map();

// 쿠키 함수
export const cookies = jest.fn(() => {
  return {
    get: jest.fn((name) => {
      if (defaultCookieStore.has(name)) {
        return { 
          name, 
          value: defaultCookieStore.get(name),
          // 표준 쿠키 속성
          path: '/',
          expires: new Date(Date.now() + 86400000), // 기본 1일
          maxAge: 86400,
          domain: 'localhost',
          secure: false,
          httpOnly: true,
          sameSite: 'lax',
        };
      }
      return undefined;
    }),
    getAll: jest.fn(() => {
      return Array.from(defaultCookieStore.entries()).map(([name, value]) => ({
        name,
        value,
        path: '/',
        expires: new Date(Date.now() + 86400000),
        maxAge: 86400,
        domain: 'localhost',
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
      }));
    }),
    set: jest.fn((name, value, options = {}) => {
      defaultCookieStore.set(name, value);
    }),
    delete: jest.fn((name) => {
      defaultCookieStore.delete(name);
    }),
    has: jest.fn((name) => {
      return defaultCookieStore.has(name);
    }),
  };
});

// 헤더 저장소
const headerStore = new Map();

// 헤더 함수
export const headers = jest.fn(() => {
  return {
    get: jest.fn((name) => headerStore.get(name) || null),
    has: jest.fn((name) => headerStore.has(name)),
    entries: jest.fn(() => Array.from(headerStore.entries())),
    forEach: jest.fn((callback) => headerStore.forEach(callback)),
  };
});

// 테스트에서 사용할 수 있는 유틸리티 함수들
export const __testUtils = {
  setCookie: (name, value) => {
    defaultCookieStore.set(name, value);
  },
  clearCookies: () => {
    defaultCookieStore.clear();
  },
  setHeader: (name, value) => {
    headerStore.set(name, value);
  },
  clearHeaders: () => {
    headerStore.clear();
  },
}; 