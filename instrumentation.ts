// Sentry 설정을 등록하기 위한 파일
import * as Sentry from '@sentry/nextjs';

export function register() {
  // Sentry 초기화 - 환경에 따라 적절한 설정 파일이 로드됨
  // - 클라이언트: sentry.client.config.js
  // - 서버: sentry.server.config.js  
  // - Edge: sentry.edge.config.js
  
  // Sentry 경고 메시지 억제
  process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING = '1';
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Sentry instrumentation registered for', process.env.NODE_ENV);
  }
}

// onRequestError 훅 설정 - Next.js 15.3.1 최신 방식
export function onRequestError({ error, request }: { error: any; request: Request }) {
  // 에러를 Sentry로 전송
  Sentry.captureException(error, {
    tags: {
      component: 'instrumentation',
      source: 'onRequestError'
    },
    extra: {
      requestUrl: request?.url,
      requestMethod: request?.method,
      requestHeaders: request?.headers ? Object.fromEntries(request.headers.entries()) : undefined,
    },
    contexts: {
      request: {
        url: request?.url,
        method: request?.method,
      }
    }
  });
  
  if (process.env.NODE_ENV === 'development') {
    try {
      const msg = (error && (error.message || error.toString?.())) || 'Unknown error';
      console.error('🚨 Request error captured by Sentry:', msg);
    } catch {
      console.error('🚨 Request error captured by Sentry');
    }
  }
} 