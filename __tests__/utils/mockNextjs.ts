/**
 * Next.js 모킹 유틸리티
 * 
 * Next.js App Router 기능을 테스트하기 위한 유틸리티 함수들을 제공합니다.
 */

import { NextRequest, NextResponse } from 'next/server';

// Next.js navigation 모듈 가져오기 (이미 모킹됨)
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
  notFound,
  redirect,
} from 'next/navigation';

// Next.js headers 모듈 가져오기 (이미 모킹됨)
import {
  cookies,
  headers,
} from 'next/headers';

// 테스트 유틸리티 타입 정의
interface NavTestUtils {
  resetRouterState: () => void;
  setRouterState: (state: any) => void;
  setPathname: (pathname: string) => void;
  setSearchParams: (params: Record<string, string> | URLSearchParams) => void;
  setParams: (params: Record<string, string>) => void;
}

interface HeadersTestUtils {
  setCookie: (name: string, value: string) => void;
  clearCookies: () => void;
  setHeader: (name: string, value: string) => void;
  clearHeaders: () => void;
}

// 모킹된 모듈에서 테스트 유틸리티 가져오기
// 참고: 이 부분은 실제 모듈에서는 존재하지 않고, 모킹된 구현에만 존재합니다
// @ts-ignore
const navTestUtils: NavTestUtils = require('next/navigation').__testUtils;
// @ts-ignore
const headersTestUtils: HeadersTestUtils = require('next/headers').__testUtils;

// 모의 NextRequest 생성 유틸리티
export const createMockNextRequest = (options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: BodyInit | null;
  nextUrl?: {
    pathname?: string;
    search?: string;
    hash?: string;
    basePath?: string;
  };
} = {}): NextRequest => {
  const {
    url = 'http://localhost:3000',
    method = 'GET',
    headers: headerInit = {},
    cookies: cookiesInit = {},
    body = null,
    nextUrl = {},
  } = options;

  // 헤더 설정
  const headersObj = new Headers();
  Object.entries(headerInit).forEach(([key, value]) => {
    headersObj.set(key, value);
  });

  // 쿠키 설정
  const cookieStrings: string[] = [];
  Object.entries(cookiesInit).forEach(([key, value]) => {
    cookieStrings.push(`${key}=${value}`);
  });
  
  if (cookieStrings.length > 0) {
    headersObj.set('cookie', cookieStrings.join('; '));
  }

  // NextRequest 생성
  const request = new Request(url, {
    method,
    headers: headersObj,
    body,
  }) as unknown as NextRequest;

  // nextUrl 설정
  const urlObj = new URL(url);
  
  // nextUrl 속성 추가
  Object.defineProperty(request, 'nextUrl', {
    value: {
      pathname: nextUrl.pathname || urlObj.pathname,
      search: nextUrl.search || urlObj.search,
      hash: nextUrl.hash || urlObj.hash,
      basePath: nextUrl.basePath || '',
      // 추가 nextUrl 속성
      clone: () => ({ ...urlObj }),
      href: urlObj.href,
      origin: urlObj.origin,
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port,
      host: urlObj.host,
      searchParams: urlObj.searchParams,
    },
    writable: true,
  });

  // cookies 메서드 추가
  Object.defineProperty(request, 'cookies', {
    value: {
      get: (name: string) => {
        const cookieValue = cookiesInit[name];
        return cookieValue
          ? { name, value: cookieValue }
          : undefined;
      },
      getAll: () => {
        return Object.entries(cookiesInit).map(([name, value]) => ({
          name,
          value,
        }));
      },
      has: (name: string) => name in cookiesInit,
      set: jest.fn(),
      delete: jest.fn(),
    },
    writable: true,
  });

  return request;
};

// 모의 NextResponse 생성 유틸리티
export const createMockNextResponse = (options: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: BodyInit | null;
  redirected?: boolean;
} = {}): NextResponse => {
  const {
    status = 200,
    statusText = 'OK',
    headers: headerInit = {},
    cookies: cookiesInit = {},
    body = null,
    redirected = false,
  } = options;

  // 헤더 설정
  const headersObj = new Headers();
  Object.entries(headerInit).forEach(([key, value]) => {
    headersObj.set(key, value);
  });

  // 쿠키 설정
  Object.entries(cookiesInit).forEach(([key, value]) => {
    headersObj.append('set-cookie', `${key}=${value}; Path=/`);
  });

  // Response 생성
  const response = new Response(body, {
    status,
    statusText,
    headers: headersObj,
  }) as unknown as NextResponse;

  // cookies 메서드 추가
  Object.defineProperty(response, 'cookies', {
    value: {
      get: (name: string) => {
        const cookieValue = cookiesInit[name];
        return cookieValue
          ? { name, value: cookieValue }
          : undefined;
      },
      getAll: () => {
        return Object.entries(cookiesInit).map(([name, value]) => ({
          name,
          value,
        }));
      },
      has: (name: string) => name in cookiesInit,
      set: jest.fn(),
      delete: jest.fn(),
    },
    writable: true,
  });

  // redirected 속성 추가
  Object.defineProperty(response, 'redirected', {
    value: redirected,
    writable: true,
  });

  return response;
};

// 서버 액션 모킹
export const createMockServerAction = <T extends (...args: any[]) => any>(
  mockImplementation: T
): T => {
  return jest.fn(mockImplementation) as unknown as T;
};

// 테스트 유틸리티 함수들
export const nextJsTestUtils = {
  // 라우터 유틸리티
  router: {
    ...navTestUtils,
    mockPush: jest.fn((path: string) => {
      useRouter().push(path);
    }),
    mockReplace: jest.fn((path: string) => {
      useRouter().replace(path);
    }),
  },
  
  // 헤더/쿠키 유틸리티
  headers: {
    ...headersTestUtils,
    mockRequestCookies: (cookiesObj: Record<string, string>) => {
      Object.entries(cookiesObj).forEach(([name, value]) => {
        headersTestUtils.setCookie(name, value);
      });
    },
    mockRequestHeaders: (headersObj: Record<string, string>) => {
      Object.entries(headersObj).forEach(([name, value]) => {
        headersTestUtils.setHeader(name, value);
      });
    },
  },

  // 리다이렉트/Not Found 유틸리티
  mockRedirect: jest.fn((url: string) => {
    redirect(url);
  }),
  
  mockNotFound: jest.fn(() => {
    notFound();
  }),
  
  // 경로 유틸리티
  setCurrentPathname: navTestUtils.setPathname,
  setCurrentSearchParams: navTestUtils.setSearchParams,
  setRouteParams: navTestUtils.setParams,
  
  // 모든 모킹 초기화
  resetAllMocks: () => {
    navTestUtils.resetRouterState();
    headersTestUtils.clearCookies();
    headersTestUtils.clearHeaders();
  },
};

// Re-export Next.js 훅/함수들
export {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
  notFound,
  redirect,
  cookies,
  headers,
}; 