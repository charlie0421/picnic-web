// This file configures the initialization of Sentry on the server side.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// DSN이 없으면 Sentry 초기화를 건너뛰기 (개발 환경에서 네트워크 에러 방지)
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Debug mode - only in development
    debug: process.env.NODE_ENV === 'development',
    
    // Environment
    environment: process.env.NODE_ENV || 'development',
    
    // Sample rate for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Integrations for server-side
    integrations: [
      // HTTP integration for tracking HTTP requests
      Sentry.httpIntegration({
        tracing: {
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
        },
      }),
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
      
      return event;
    },
    
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