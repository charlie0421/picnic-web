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
  'envtest.boundary.self_throw',
  'envtest.delivery.unhandled',
  'envtest.delivery.handled',
  'auth.apple.failed',
  'auth.apple.post.unhandled',
  'auth.apple.token_verify.failed',
  'auth.callback.get.unhandled',
  'auth.callback.signout.failed',
  'auth.callback.withdrawal.failed',
  'auth.exchange_code.exchange.failed',
  'auth.exchange_code.failed',
  'auth.exchange_code.post.unhandled',
  'auth.exchange_code.profile.failed',
  'auth.exchange_code.withdrawal.failed',
  'auth.google.get.failed',
  'auth.google.get.unhandled',
  'auth.google.post.failed',
  'auth.google.post.unhandled',
  'auth.google.start.failed',
  'auth.google.token_exchange.failed',
  'auth.google.token_verify.failed',
  'auth.google.userinfo.failed',
  'auth.kakao.config.failed',
  'auth.kakao.delete.failed',
  'auth.kakao.delete.unhandled',
  'auth.kakao.post.failed',
  'auth.kakao.post.unhandled',
  'auth.kakao.profile_lookup.failed',
  'auth.kakao.token_exchange.failed',
  'auth.kakao.token_missing.failed',
  'auth.kakao.unlink.failed',
  'auth.kakao.userinfo.failed',
  'auth.logout.failed',
  'auth.logout.get.unhandled',
  'auth.logout.options.unhandled',
  'auth.logout.post.unhandled',
  'auth.logout.signout.failed',
  'auth.logout.status.failed',
  'auth.register.failed',
  'auth.register.post.unhandled',
  'auth.register.signup.failed',
  'auth.server.get_user.failed',
  'auth.server.withdrawal_check.failed',
  'auth.session.failed',
  'auth.session.get.unhandled',
  'auth.social.apple.failed',
  'auth.social.callback_handler.failed',
  'auth.social.google.failed',
  'auth.social.kakao.failed',
  'auth.social.profile_handlers.failed',
  'auth.social.service.failed',
  'auth.v1.callback.failed',
  'auth.v1.callback.get.unhandled',
  'auth.v1.callback.post.unhandled',
  'auth.verify.failed',
  'auth.verify.get.unhandled',
  'auth.verify.options.unhandled',
  'auth.verify.profile.failed',
  'auth.verify.user.failed',
] as const;

export type LogEventCode = (typeof LOG_EVENT_CODES)[number];

export const FALLBACK_EVENT_CODE: LogEventCode = 'log.invalid_event_code';

const CODES: ReadonlySet<unknown> = new Set(LOG_EVENT_CODES);

export function isLogEventCode(value: unknown): value is LogEventCode {
  return CODES.has(value);
}
