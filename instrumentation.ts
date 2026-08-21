// Sentry 초기화 진입점
//
// @sentry/nextjs v8+ 부터 sentry.server.config / sentry.edge.config 는
// 자동으로 로드되지 않는다. 이 파일에서 런타임별로 직접 import 해야
// Sentry.init 이 실행된다. 클라이언트는 Next 가 instrumentation-client.ts 를
// 자동 로드하므로 여기서 다루지 않는다.
import type { Instrumentation } from 'next';
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

// Next.js 서버·edge 요청 오류 훅.
//
// Next 의 계약은 (error, request, errorContext) 세 개의 위치 인자다
// (next/dist/server/instrumentation/types.d.ts 의 InstrumentationOnRequestError).
// 이전 구현은 첫 인자를 { error, request } 로 구조분해해서 실제 Error 대신
// undefined 를 캡처했고, request 도 undefined 였다. 또 request.headers 는
// Headers 가 아니라 NodeJS.Dict 라서 .entries() 호출은 throw 한다.
//
// SDK 가 제공하는 captureRequestError 가 이 시그니처를 그대로 받으므로
// 직접 구현하지 않고 위임한다. 헤더 원문을 복사하지 않는 것도 이점이다.
export const onRequestError: Instrumentation.onRequestError = Sentry.captureRequestError;
