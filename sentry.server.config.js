// This file configures the initialization of Sentry on the server side.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { REQUEST_DATA_INCLUDE, resolveTracesSampleRate, withoutConsole } from './lib/sentry/collection';
import { scrubEvent, scrubSpan } from './lib/sentry/scrub';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// DSN이 없으면 Sentry 초기화를 건너뛰기 (개발 환경에서 네트워크 에러 방지)
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Debug mode - only in development
    debug: process.env.NODE_ENV === 'development',
    
    // Environment
    environment: process.env.NODE_ENV || 'development',
    
    // Sample rate for performance monitoring.
    // SENTRY_TRACES_SAMPLE_RATE 는 envelope 테스트가 표본을 강제할 때만 쓴다(0~1 밖의 값은 무시한다).
    tracesSampleRate: resolveTracesSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE,
      process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    ),
    
    // Integrations for server-side.
    // 함수 형태로 받아 기본 목록에서 Console 을 뺀다. 같은 이름의 integration 은 뒤에 온 것이 기본 것을 대신한다.
    integrations: (defaults) => [
      // 서버의 console 출력은 Vercel 로그에 이미 있다. breadcrumb 로 다시 싣지 않는다.
      ...withoutConsole(defaults),
      // HTTP integration for tracking HTTP requests
      // ignoreIncomingRequests / ignoreOutgoingRequests 는 HttpOptions 의
      // 최상위 옵션이다. tracing 하위에 두면 SDK 가 읽지 않아 필터가
      // 통째로 무시된다(@sentry/node 9.x HttpOptions 참조).
      Sentry.httpIntegration({
        // Don't track requests to health check endpoints
        ignoreIncomingRequests: (url) => {
          return url.includes('/api/health') ||
                 url.includes('/api/ping') ||
                 url.includes('/_next/static') ||
                 url.includes('/favicon.ico');
        },
        // Don't track outgoing requests to certain domains
        ignoreOutgoingRequests: (url) => {
          return url.includes('sentry.io');
        },
      }),
      // 기본값은 쿠키·헤더·쿼리·본문을 이벤트에 붙인다(sendDefaultPii 와 무관하다). url 만 남긴다.
      Sentry.requestDataIntegration({ include: REQUEST_DATA_INCLUDE }),
    ],
    
    // Server-specific options
    beforeSend(event) {
      // Filter out known server errors in development
      if (process.env.NODE_ENV === 'development') {
        // Skip certain development-only errors
        if (event.exception) {
          const error = event.exception.values?.[0];
          if (error?.value?.includes('ECONNREFUSED') || 
              error?.value?.includes('MODULE_NOT_FOUND')) {
            return null;
          }
        }
      }
      
      // Filter out API route not found errors in production
      if (event.exception) {
        const error = event.exception.values?.[0];
        if (error?.value?.includes('404') && error?.value?.includes('api')) {
          return null;
        }
      }
      
      // 요청 데이터, URL 쿼리, 토큰 모양 값을 지운다(lib/sentry/scrub.ts).
      return scrubEvent(event);
    },

    // transaction 과 span 에도 같은 규칙을 건다. 쿼리는 http.target·url.full·url.query 같은 속성으로도 실린다.
    beforeSendTransaction: scrubEvent,
    beforeSendSpan: scrubSpan,
    
    // Release information
    release: process.env.SENTRY_RELEASE,
    
    // Additional server options
    maxBreadcrumbs: 50,
    
    // Server name for identification
    serverName: process.env.SENTRY_SERVER_NAME || 'picnic-web-server',
  });
  
  console.log('🔧 Sentry 서버 초기화 완료:', process.env.NODE_ENV);
} else {
  console.log('ℹ️ Sentry DSN이 설정되지 않아 서버 초기화를 건너뜁니다 (개발 환경)');
} 