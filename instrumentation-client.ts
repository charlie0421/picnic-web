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
        // Drop errors originating from third-party ad SDK frames
        // (Google AdSense / DoubleClick / Twitter in-app webview injected globals).
        // 우리 코드와 무관하며 disposed iframe race / 외부 전역 변수 미정의가 대다수.
        const frames = error?.stacktrace?.frames ?? [];
        const isThirdPartyAd = frames.some((f) => {
          const fn = f.filename ?? '';
          return (
            fn.includes('/pagead/') ||
            fn.includes('googlesyndication.com') ||
            fn.includes('googletagservices.com') ||
            fn.includes('doubleclick.net') ||
            fn.includes('adsbygoogle')
          );
        });
        if (isThirdPartyAd) {
          return null;
        }
      }
      // 인앱 브라우저 (Twitter/X, Facebook, Instagram, KakaoTalk, Line, NAVER 등) 의
      // hydration / replay_hydration_error 는 외부에서 DOM 을 mutate 하기 때문에
      // 우리 코드로 100% 제거 불가능. 노이즈 차단.
      const isHydrationError =
        event.exception?.values?.[0]?.value?.toLowerCase().includes('hydrat') ||
        (typeof event.message === 'string' && event.message.toLowerCase().includes('hydrat')) ||
        event.tags?.['issue.type'] === 'replay_hydration_error';
      if (isHydrationError) {
        const ua = (event.request?.headers as Record<string, string> | undefined)?.['user-agent'] ?? '';
        const browserName = (event.contexts?.browser?.name as string | undefined) ?? '';
        const isInAppBrowser =
          /KAKAOTALK|FBAV|FBAN|FB_IAB|Instagram|Twitter|TwitterAndroid|Line\/|NAVER\(inapp/i.test(ua) ||
          /Twitter|Facebook|Instagram|KakaoTalk|Line|NAVER/i.test(browserName);
        if (isInAppBrowser) {
          return null;
        }
        // Google AdSense Auto ads (특히 #google_vignette interstitial) 가 hydration
        // 종료 전에 DOM 을 mutate 하면 우리 코드와 무관한 hydration mismatch 가
        // 잡힌다. URL fragment / request URL 이 광고 단서면 drop.
        const reqUrl =
          (typeof event.request?.url === 'string' ? event.request.url : '') ||
          (event.tags && (event.tags as Record<string, string>)['url']) ||
          '';
        if (
          reqUrl.includes('#google_vignette') ||
          reqUrl.includes('googlesyndication') ||
          reqUrl.includes('googleadservices')
        ) {
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
      // 외부 SDK / 인앱 브라우저 주입 변수 (Twitter, Facebook 등 in-app webview)
      "Can't find variable: CONFIG",
      'CONFIG is not defined',
      // Google AdSense iframe disposal race (우리가 제어 불가)
      'Accessing domItems after disposal',
      'adsbygoogle.push() error',
      // 사용자가 페이지 이탈/요청 취소 시 발생, 정상 흐름
      'AbortError',
      'The user aborted a request',
      // Supabase realtime 채널 정상 종료
      'Connection closed',
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