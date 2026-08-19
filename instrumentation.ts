// Sentry 초기화 진입점
//
// @sentry/nextjs v8+ 부터 sentry.server.config / sentry.edge.config 는
// 자동으로 로드되지 않는다. 이 파일에서 런타임별로 직접 import 해야
// Sentry.init 이 실행된다. 클라이언트는 Next 가 instrumentation-client.ts 를
// 자동 로드하므로 여기서 다루지 않는다.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Sentry instrumentation registered for', process.env.NEXT_RUNTIME);
  }
}

// onRequestError 훅 - Next.js 15 방식
export function onRequestError({ error, request }: { error: any; request: Request }) {
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
