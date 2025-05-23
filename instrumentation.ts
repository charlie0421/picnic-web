// Sentry 설정을 등록하기 위한 파일
import * as Sentry from '@sentry/nextjs';

export function register() {
  // Sentry 관련 등록 코드가 필요한 경우 여기에 추가
  // 현재는 환경 변수로 경고 메시지를 억제하도록 설정
  process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING = '1';
}

// onRequestError 훅 설정
export function onRequestError({ error, request }: { error: Error; request: Request }) {
  // Next.js 15.3.1에 맞게 Sentry 에러 캡처 설정
  Sentry.captureException(error, {
    extra: {
      requestUrl: request?.url,
      requestMethod: request?.method
    }
  });
} 