const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Next.js 앱의 경로를 제공하여 테스트 환경에서 next.config.js와 .env 파일을 로드합니다
  dir: './',
});

// Jest에 전달할 사용자 정의 설정
const customJestConfig = {
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/__tests__/setup.ts',
  ],
  testEnvironment: 'jest-environment-jsdom',
  moduleDirectories: ['node_modules', '<rootDir>/'],
  moduleNameMapper: {
    // 경로 별칭 핸들링 - 정규식 수정
    '@/(.*)': '<rootDir>/$1',
    // Swiper 모듈 처리
    '^swiper/react$': '<rootDir>/__mocks__/swiper-react.js',
    '^swiper$': '<rootDir>/__mocks__/swiper.js',
    '^swiper/modules$': '<rootDir>/__mocks__/swiper-modules.js',
    '^swiper/(.*)$': '<rootDir>/__mocks__/swiper.js',
    // CSS 모듈 처리
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  // ES 모듈 변환을 위한 설정
  transformIgnorePatterns: [
    'node_modules/(?!(swiper|ssr-window|dom7)/)',
  ],
  // 글로벌 설정
  globals: {
    fetch: global.fetch,
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'hooks/**/*.{js,jsx,ts,tsx}',
    'utils/**/*.{js,jsx,ts,tsx}',
    'contexts/**/*.{js,jsx,ts,tsx}',
    'stores/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/types/**',
    '!**/constants/**',
    '!**/__mocks__/**',
    '!**/__tests__/**',
    '!**/coverage/**',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/__tests__/setup.ts',
    '<rootDir>/__tests__/utils/test-utils.tsx',
  ],
  // 병렬 실행 설정 (기본값은 OS 논리 CPU 수 - 1)
  maxWorkers: '50%',
  // 각 테스트 파일에 대해 최대 테스트 실행 시간 설정 (밀리초)
  testTimeout: 15000,
  // 최소 커버리지 기준 설정
  coverageThreshold: {
    global: {
      statements: 80, // 요구사항에 따라 80%로 변경
      branches: 80,
      functions: 80,
      lines: 80,
    },
    // 중요 디렉터리/파일에 대한 더 높은 커버리지 요구 설정
    './utils/api/': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    './components/ui/': {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    './lib/supabase/': {
      statements: 75,
      branches: 75,
      functions: 75,
      lines: 75,
    },
    './hooks/': {
      statements: 75,
      branches: 75,
      functions: 75,
      lines: 75,
    },
  },
  // 커버리지 보고서 설정
  coverageReporters: ['json', 'json-summary', 'lcov', 'text', 'text-summary', 'clover', 'html'],
  // 캐시 설정
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  // 테스트 파일 패턴 최적화
  testMatch: ['**/__tests__/**/*.(spec|test).[jt]s?(x)'],
  // 변경된 파일만 테스트하는 옵션 (CI에서는 false로 설정)
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/coverage/',
  ],
};

// createJestConfig는 next/jest가 비동기 설정을 제공할 수 있도록 내보내기를 자동으로 처리합니다
module.exports = createJestConfig(customJestConfig);
