/**
 * console.error 를 대체하는 동기 헬퍼.
 *
 * logger.error 는 async 라 호출부마다 await 가 필요하다. 기존 console.error
 * 를 그대로 갈아끼울 수 있도록 동기 시그니처로 감싼다. logger 의
 * ConsoleLogTarget 이 여전히 콘솔에 출력하므로 로컬 디버깅은 그대로다.
 *
 * 프로덕션에서는 SentryLogTarget 이 함께 등록돼 Sentry 로도 전송된다.
 */
import { logger } from './logger';

/**
 * Error 로 볼 수 없는 평범한 객체인가.
 *
 * console.error('msg', { a, b }) 형태가 흔한데 이를 error 로 다루면
 * JSON 직렬화되어 Error 메시지에 들어간다. 메시지는 redaction 대상이
 * 아니므로 민감 값이 그대로 새어 나간다. 이런 값은 context 로 올린다.
 */
function isPlainContext(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Error) &&
    !Array.isArray(value)
  );
}

function toError(error?: unknown): Error | undefined {
  if (error === undefined || error === null) return undefined;
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  return new Error(String(error));
}

/**
 * 에러를 콘솔과 Sentry 로 함께 남긴다.
 *
 * 반환값이 없는 동기 함수다. 내부 Promise 는 의도적으로 기다리지 않는다.
 * Sentry 모듈은 부팅 시 이미 로드되므로 전송 enqueue 는 마이크로태스크에서
 * 끝난다. 로깅 실패는 삼킨다 — 로깅이 요청을 깨뜨리면 안 된다.
 */
export function logError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    // 평범한 객체는 error 가 아니라 context 로 보낸다. 그래야 redaction 을 탄다.
    const mergedContext = isPlainContext(error)
      ? { ...error, ...(context ?? {}) }
      : context;
    const normalizedError = isPlainContext(error) ? undefined : toError(error);

    void logger.error(message, normalizedError, mergedContext)?.catch?.(() => {});
  } catch {
    // 로깅 실패는 무시한다.
  }
}
