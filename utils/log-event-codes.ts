/**
 * logSafeError 가 받는 사건 코드의 닫힌 목록 (설계 §4.2).
 *
 * 코드는 문자열을 조립해 만들지 않는다. 새 사건은 이 파일에 한 줄을 더해 만든다.
 * 타입은 `as any` 로 넘긴 값을 막지 못하므로 런타임에도 목록을 확인한다. 목록에 없으면
 * FALLBACK_EVENT_CODE 로 바꿔 남긴다 — 오류가 났다는 사실까지 버리지는 않는다.
 *
 * 모양: 점으로 나눈 소문자 마디 둘 이상(`payment.paypal.capture.failed`).
 * 단위 테스트(__tests__/utils/log-event-codes.test.ts)가 모양과 중복을 고정한다.
 */
export const LOG_EVENT_CODES = [
  // 계약 함수가 스스로 쓴다: 호출부가 목록에 없는 코드를 넘겼다.
  'log.invalid_event_code',
  // envelope·전달 테스트용 라우트(scripts/envelope-test/routes/)가 쓴다. 운영 코드는 쓰지 않는다.
  'envtest.boundary.unhandled',
  'envtest.boundary.handled',
  'envtest.boundary.hostile',
  'envtest.delivery.unhandled',
  'envtest.delivery.handled',
] as const;

export type LogEventCode = (typeof LOG_EVENT_CODES)[number];

export const FALLBACK_EVENT_CODE: LogEventCode = 'log.invalid_event_code';

const CODES: ReadonlySet<unknown> = new Set(LOG_EVENT_CODES);

export function isLogEventCode(value: unknown): value is LogEventCode {
  return CODES.has(value);
}
