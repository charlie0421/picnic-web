// This file configures the initialization of Sentry for edge runtime environments.
// The config you add here will be used whenever a pages router route uses the edge runtime.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { withoutConsole } from './lib/sentry/collection';
import { scrubEvent, scrubSpan } from './lib/sentry/scrub';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

// DSN이 없으면 Sentry 초기화를 건너뛰기 (개발 환경에서 네트워크 에러 방지)
if (SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: SENTRY_DSN,

      // Debug mode - only in development
      debug: process.env.NODE_ENV === 'development',

      // Environment
      environment: process.env.NODE_ENV || 'development',

      // Edge 에서는 트레이싱 옵션을 설정하지 않아 오류 이벤트만 수집한다.

      // 기본 integration 에서 Console 만 뺀다. edge 의 기본 목록에는 RequestData 가 없다
      // (sendDefaultPii 를 켜지 않는 한). __tests__/lib/sentry/collection.test.ts 가 고정한다.
      integrations: (defaults) => withoutConsole(defaults),

      // Edge runtime specific options
      beforeSend(event) {
        // Filter middleware-specific errors in development
        if (process.env.NODE_ENV === 'development') {
          if (event.exception) {
            const error = event.exception.values?.[0];
            if (error?.value?.includes('middleware') &&
                error?.value?.includes('redirect')) {
              return null;
            }
          }
        }

        // URL 쿼리와 토큰 모양 값을 지운다(lib/sentry/scrub.ts). 서버와 같은 함수다.
        return scrubEvent(event);
      },

      // 트레이싱을 켜지 않으므로 평소에는 불리지 않는다. SDK 가 SENTRY_TRACES_SAMPLE_RATE 를 스스로 읽어
      // 표본이 켜지는 경우(envelope 테스트)에 대비한다.
      beforeSendTransaction: scrubEvent,
      beforeSendSpan: scrubSpan,

      // Release information
      release: process.env.SENTRY_RELEASE,

      // Keep breadcrumbs minimal in edge runtime
      maxBreadcrumbs: 10,

      // Edge runtime identifier
      // tags 는 Sentry.init 의 옵션이 아니다. 이벤트에 기본 태그를 붙이려면
      // initialScope 를 써야 한다.
      initialScope: {
        tags: {
          runtime: 'edge',
        },
      },
    });

    console.log('🔧 Sentry Edge 초기화 완료:', process.env.NODE_ENV);
  } catch (error) {
    // 계측 초기화 실패가 middleware 요청 자체를 실패시키지 않게 한다.
    console.error('❌ Sentry Edge 초기화 실패:', error);
  }
} else {
  console.log('ℹ️ Sentry DSN이 설정되지 않아 Edge 초기화를 건너뜁니다 (개발 환경)');
}
