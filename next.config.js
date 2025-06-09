// sentry 설정 래퍼 추가
const { withSentryConfig } = require('@sentry/nextjs');

// 환경 변수로 Sentry 경고 억제
process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 페이지 및 레이아웃 최적화 설정
  compiler: {
    // 불필요한 JavaScript 제거 
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // 서버 컴포넌트가 자주 변경되지 않는 경우 정적 페이지 생성 시간 최적화
  staticPageGenerationTimeout: 120, // 2분으로 타임아웃 설정
  
  // 이미지 최적화
  images: {
    // 배포 환경에서는 이미지 최적화 활성화 (unoptimized: false)
    unoptimized: process.env.NODE_ENV !== 'production',
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'xtijtefcycoeqludlngc.supabase.co' },
      { protocol: 'https', hostname: 'api.picnic.fan' },
      { protocol: 'https', hostname: 'cdn.picnic.fan' },
      { protocol: 'https', hostname: 'picnic-fan.s3.ap-northeast-2.amazonaws.com' },
      { protocol: 'https', hostname: 'img.youtube.com' }
    ],
    minimumCacheTTL: 60, // 이미지 캐시 시간 설정 (초 단위)
  },
  
  // 실험적 기능 활성화
  experimental: {
    // 서버 컴포넌트에서 React 18 스트리밍 활성화
    serverActions: {
      enabled: true
    },
    // 페이지당 개별 CSS 대신 앱 전체 CSS 번들링
    optimizeCss: true,
    // 프리페치 최적화 활성화
    optimisticClientCache: true,
    // 스크롤 복원 개선
    scrollRestoration: true,
  },
  
  // 성능 최적화를 위한 webpack 설정
  webpack: (config, { dev, isServer }) => {
    // 프로덕션 빌드에서만 최적화 적용
    if (!dev) {
      // 코드 스플리팅 최적화
      config.optimization.splitChunks = {
        chunks: 'all',
        maxInitialRequests: 25,
        minSize: 20000,
      };
    }
    
    return config;
  },
  
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, apikey, Authorization' },
        ]
      },
      {
        source: '/supabase-proxy/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, apikey' },
        ]
      },
      {
        source: '/:lang/supabase-proxy/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, apikey' },
        ]
      },
      // 추가 캐싱 헤더 설정
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }
        ]
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
    ];
  },
  
  async redirects() {
    return [
      // download를 기본 언어로 리디렉션
      {
        source: '/download',
        destination: '/en/download',
        permanent: true
      },
      // download.html을 download로 리디렉션
      {
        source: '/download.html',
        destination: '/en/download',
        permanent: true
      },
      {
        source: '/:lang/download.html',
        destination: '/:lang/download',
        permanent: true
      }
    ];
  },
  
  async rewrites() {
    return [
      {
        source: '/supabase-proxy/:path*',
        destination: 'https://xtijtefcycoeqludlngc.supabase.co/:path*'
      },
      {
        source: '/:lang/supabase-proxy/:path*',
        destination: 'https://xtijtefcycoeqludlngc.supabase.co/:path*'
      }
    ];
  }
};

const sentryWebpackPluginOptions = {
  silent: true, // 로그 비활성화
  // 필요한 경우 authToken, org, project 등 추가 설정
  hideSourceMaps: true // 소스맵 숨기기
};

module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);