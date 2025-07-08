// This file configures the initialization of Sentry on the browser/client side.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  
  // Debug mode - only in development
  debug: process.env.NODE_ENV === 'development',
  
  // Environment
  environment: process.env.NODE_ENV || 'development',
  
  // Sample rate for performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Sample rate for session replays
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,
  
  // Sample rate for error replays
  replaysOnErrorSampleRate: 1.0,
  
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
  
  // Performance options
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
}); 