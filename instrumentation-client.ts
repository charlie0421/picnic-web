// This file configures the initialization of Sentry on the browser/client side.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const SENTRY_DEBUG = process.env.NEXT_PUBLIC_SENTRY_DEBUG === 'true';
const TRACES_RATE = parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE || (process.env.NODE_ENV === 'production' ? '0.02' : '0.1'));
const REPLAY_SESSION_RATE = parseFloat(process.env.NEXT_PUBLIC_SENTRY_SESSION_SAMPLE_RATE || (process.env.NODE_ENV === 'production' ? '0.0' : '0.02'));
const REPLAY_ERROR_RATE = parseFloat(process.env.NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE || '1.0');

// DSN이 없으면 Sentry 초기화를 건너뛰기 (개발 환경에서 네트워크 에러 방지)
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Debug mode - only in development
    debug: SENTRY_DEBUG,
    
    // Environment
    environment: process.env.NODE_ENV || 'development',
    
    // Sample rate for performance monitoring (env-driven, conservative default)
    tracesSampleRate: TRACES_RATE,
    
    // Sample rate for session replays (disabled by default in prod)
    replaysSessionSampleRate: REPLAY_SESSION_RATE,
    
    // Sample rate for error replays
    replaysOnErrorSampleRate: REPLAY_ERROR_RATE,
    
    // Configure integrations
    integrations: [
      // Session Replay integration for debugging
      Sentry.replayIntegration({
        // Mask all text content, but not input values
        maskAllText: false,
        // Block all media elements
        blockAllMedia: true,
      }),
      
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        // Automatic route change tracking for Next.js App Router
        // nextRouterInstrumentation is deprecated in v9+
      }),
    ],
    
    // Event filtering
    beforeSend(event) {
      // Filter out known development errors
      if (event.exception) {
        const error = event.exception.values?.[0];
        if (error?.value?.includes('hydration') && process.env.NODE_ENV === 'development') {
          return null;
        }
      }
      return event;
    },
    // Breadcrumb filtering (drop noisy console/info logs)
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' && (breadcrumb.level === 'log' || breadcrumb.level === 'debug')) {
        return null;
      }
      if (breadcrumb.category === 'ui.click') {
        // Drop extremely frequent UI click breadcrumbs to reduce noise
        return null;
      }
      return breadcrumb;
    },
    
    // Release information
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    
    // Additional options
    ignoreErrors: [
      // Ignore common browser extension errors
      'Script error.',
      'Non-Error promise rejection captured',
      // Ignore Next.js hydration errors in development
      'Hydration failed',
      'There was an error while hydrating',
    ],
    maxBreadcrumbs: 30,
  });
  
  if (SENTRY_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('🔧 Sentry 클라이언트 초기화 완료:', process.env.NODE_ENV, {
      tracesSampleRate: TRACES_RATE,
      replaysSessionSampleRate: REPLAY_SESSION_RATE,
      replaysOnErrorSampleRate: REPLAY_ERROR_RATE,
    });
  }
} else {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('ℹ️ Sentry DSN이 설정되지 않아 초기화를 건너뜁니다 (개발 환경)');
  }
}

// Export the required router transition hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart; 