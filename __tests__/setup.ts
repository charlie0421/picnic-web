/**
 * Jest 테스트 환경 설정 파일
 * 
 * 이 파일은 모든 테스트 파일 실행 전에 로드되어 테스트 환경을 구성합니다.
 * jest.setup.js 이후에 로드됩니다.
 */

import '@testing-library/jest-dom';

// Polyfill for missing globals in JSDom
// Node.js에서 제공하는 TextEncoder/TextDecoder를 사용하면 타입 오류가 발생할 수 있어
// 단순한 전역 객체 설정으로 변경합니다.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}

// Server Component 관련 모킹
jest.mock('react', () => {
  const originalReact = jest.requireActual('react');
  return {
    ...originalReact,
    cache: jest.fn((fn) => fn),
    use: jest.fn((promise) => {
      if (promise && typeof promise.then === 'function') {
        throw new Error(
          'React.use() is not supported in test environment. Please mock your async functions.'
        );
      }
      return promise;
    }),
  };
});

// Next.js 캐시 관련 모킹
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: jest.fn((fn) => fn),
}));

// 전역 테스트 타임아웃 설정
jest.setTimeout(10000);

// 콘솔 경고 필터링 (필요한 경우)
const originalConsoleError = console.error;
console.error = (...args) => {
  // React 18의 특정 경고 메시지를 필터링
  const suppressedWarnings = [
    'Warning: ReactDOM.render is no longer supported',
    'Warning: You are importing createRoot',
  ];
  
  if (typeof args[0] === 'string' && suppressedWarnings.some(warning => args[0].includes(warning))) {
    return;
  }
  
  originalConsoleError(...args);
}; 