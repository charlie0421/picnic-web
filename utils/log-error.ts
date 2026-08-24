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
 * Vercel serverless 에서 응답 반환 후에도 전송이 끝나도록 보장한다.
 *
 * fire-and-forget 만 하면 함수 인스턴스가 정리되며 이벤트가 유실될 수 있다.
 * Vercel 은 요청 컨텍스트를 전역 심볼로 노출하며, 그 waitUntil 에 Promise 를
 * 넘기면 완료까지 기다려 준다. 컨텍스트가 없으면(로컬 상주 서버, 브라우저)
 * 아무 것도 하지 않는다.
 */
function registerWaitUntil(promise: Promise<unknown>): void {
  try {
    const ctx = (globalThis as Record<symbol, any>)[Symbol.for('@vercel/request-context')];
    const waitUntil = ctx?.get?.()?.waitUntil;
    if (typeof waitUntil === 'function') {
      waitUntil(promise);
    }
  } catch {
    // 컨텍스트 조회 실패는 무시한다.
  }
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
  let normalizedError: Error | undefined;
  let mergedContext: Record<string, unknown> | undefined;

  try {
    // 평범한 객체는 error 가 아니라 context 로 보낸다. 그래야 redaction 을 탄다.
    // spread 는 getter 를 호출하므로 여기서 throw 할 수 있다.
    mergedContext = isPlainContext(error) ? { ...error, ...(context ?? {}) } : context;
    normalizedError = isPlainContext(error) ? undefined : toError(error);
  } catch {
    // 정제에 실패해도 로그 자체를 버리지 않는다. 메시지는 반드시 남긴다.
    mergedContext = { ...(context ?? {}), contextUnavailable: true };
    normalizedError = undefined;
  }

  try {
    const pending = logger.error(message, normalizedError, mergedContext);
    if (pending && typeof pending.catch === 'function') {
      const settled = pending.catch(() => {});
      registerWaitUntil(settled);
    }
  } catch {
    // 로깅 실패는 무시한다.
  }
}
