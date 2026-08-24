/**
 * console.error 를 대체하는 동기 헬퍼.
 *
 * logger.error 는 async 라 호출부마다 await 가 필요하다. 기존 console.error
 * 를 그대로 갈아끼울 수 있도록 동기 시그니처로 감싼다. logger 의
 * ConsoleLogTarget 이 여전히 콘솔에 출력하므로 로컬 디버깅은 그대로다.
 *
 * 프로덕션에서는 SentryLogTarget 이 함께 등록돼 Sentry 로도 전송된다.
 *
 * 알려진 한계:
 * - 전송을 기다리지 않는다. serverless 에서 응답 후 인스턴스가 정리되면
 *   이벤트가 유실될 수 있다. Sentry.flush 를 요청 수명주기에 연결하는
 *   작업이 필요하다.
 * - Sentry 로 나가는 페이로드에 중앙 redaction 이 없다. 호출부가 넘기는
 *   값과 SDK 가 자동 수집하는 헤더·쿠키·쿼리스트링이 그대로 전송된다.
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


/** error 인자와 context 를 안전하게 정규화한다. */
function normalize(
  error: unknown,
  context?: Record<string, unknown>,
): { normalizedError?: Error; mergedContext?: Record<string, unknown> } {
  try {
    // 평범한 객체는 error 가 아니라 context 로 올린다.
    // spread 는 getter 를 호출하므로 여기서 throw 할 수 있다.
    return isPlainContext(error)
      ? { normalizedError: undefined, mergedContext: { ...error, ...(context ?? {}) } }
      : { normalizedError: toError(error), mergedContext: context };
  } catch {
    // 정제에 실패해도 로그 자체를 버리지 않는다. 메시지는 반드시 남긴다.
    // fallback 은 안전한 상수만 담는다. 여기서 context 를 다시 spread 하면
    // throwing getter 를 재차 읽어 이 함수가 실제로 throw 한다.
    return { normalizedError: undefined, mergedContext: { contextUnavailable: true } };
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
  const { normalizedError, mergedContext } = normalize(error, context);

  try {
    void logger.error(message, normalizedError, mergedContext)?.catch?.(() => {});
  } catch {
    // 로깅 실패는 무시한다.
  }
}

/**
 * 예상 가능한 실패를 경고로 남긴다.
 *
 * SentryLogTarget 은 ERROR / FATAL 만 전송하므로 warn 은 콘솔에만 남는다.
 * 공개 엔드포인트의 서명 검증 실패나 잘못된 입력처럼 인증 없이 외부에서
 * 반복 유발할 수 있는 실패는 여기로 보낸다. error 로 두면 익명 요청이
 * Sentry quota 와 rate limit 을 소진시킨다.
 *
 * 서버 내부 결함(DB 오류, 설정 오류 등)에는 쓰지 말고 logError 를 쓴다.
 */
export function logWarn(
  message: string,
  detail?: unknown,
  context?: Record<string, unknown>,
): void {
  // logError 와 같은 정규화를 쓴다. 두 함수 사이를 옮길 때 호출부를
  // 고치지 않아도 되게 한다.
  const { normalizedError, mergedContext } = normalize(detail, context);

  let warnContext = mergedContext;
  try {
    // message 는 getter 일 수 있다. Proxy Error 가 여기서 throw 하면
    // logWarn 자체가 호출자에게 예외를 던진다.
    if (normalizedError) {
      warnContext = { ...(mergedContext ?? {}), error: normalizedError.message };
    }
  } catch {
    warnContext = { ...(mergedContext ?? {}), error: '[Unreadable]' };
  }

  try {
    void logger.warn(message, warnContext)?.catch?.(() => {});
  } catch {
    // 로깅 실패는 무시한다.
  }
}
