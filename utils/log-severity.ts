/**
 * 오류를 Sentry 에 ERROR 로 올릴지, 콘솔에 WARN 으로만 남길지 고른다 (#75).
 *
 * 기준은 "운영자가 조치해야 하는가"다. 누구나 반복해서 일으킬 수 있는 클라이언트 입력 문제(중복 가입, 만료된 code,
 * 위조된 토큰)는 WARN 이다. 설정 오류·공급자 장애·네트워크 오류는 ERROR 다.
 *
 * 목록에 있는 것만 WARN 으로 고른다. 모르는 코드는 ERROR 로 남는다 — 레벨을 잘못 내리면 서버 장애가 조용해진다.
 * 이 파일은 브라우저 번들에도 들어갈 수 있다. 서버 전용 코드를 import 하지 않는다.
 */

/**
 * Supabase auth 의 오류 코드 중 요청자의 입력이 원인인 것.
 * 같은 4xx 라도 over_email_send_rate_limit(SMTP 한도)·signup_disabled·email_address_not_authorized 는
 * 운영자가 설정을 봐야 하므로 여기에 넣지 않는다.
 */
const CLIENT_AUTH_CODES: ReadonlySet<string> = new Set([
  'user_already_exists',
  'email_exists',
  'weak_password',
  'validation_failed',
  'email_address_invalid',
  'over_request_rate_limit',
  'flow_state_not_found',
  'flow_state_expired',
  'bad_code_verifier',
  'bad_oauth_state',
  'pkce_code_verifier_not_found',
]);

/** Supabase auth 오류가 4xx 이고 코드가 클라이언트 입력 목록에 있으면 true. 던지지 않는다. */
export function isClientAuthError(error: unknown): boolean {
  try {
    if (typeof error !== 'object' || error === null) return false;
    const { status, code } = error as { status?: unknown; code?: unknown };
    return (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      typeof code === 'string' &&
      CLIENT_AUTH_CODES.has(code)
    );
  } catch {
    return false;
  }
}

/**
 * jose 오류 코드 중 요청자가 보낸 토큰이 원인인 것.
 * ERR_JWKS_NO_MATCHING_KEY 는 토큰 헤더의 kid 를 요청자가 정하므로 여기에 둔다. JWKS 조회 실패(시간 초과·형식 오류)는
 * 공급자나 네트워크 문제라 넣지 않는다.
 */
const CLIENT_JOSE_CODES: ReadonlySet<string> = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JWKS_NO_MATCHING_KEY',
]);

/**
 * aud·iss 검증 실패는 공급자가 서명한 토큰이 우리 설정과 맞지 않는다는 뜻이다. 요청자가 만들기 어렵고,
 * 클라이언트 ID 환경 변수가 비면 모든 토큰이 aud 에서 실패한다. 그래서 ERROR 로 남긴다.
 */
const CONFIG_CLAIMS: ReadonlySet<string> = new Set(['aud', 'iss']);

/** jose 의 토큰 검증 오류가 요청자의 토큰 결함이면 true. 던지지 않는다. */
export function isClientJoseError(error: unknown): boolean {
  try {
    if (typeof error !== 'object' || error === null) return false;
    const { code, claim } = error as { code?: unknown; claim?: unknown };
    if (typeof code !== 'string') return false;
    if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') return typeof claim === 'string' && !CONFIG_CLAIMS.has(claim);
    return CLIENT_JOSE_CODES.has(code);
  } catch {
    return false;
  }
}

/*
 * 공급자 HTTP 응답. status 하나로는 고르지 않는다 — 같은 400·422 안에 만료된 code 와 설정 오류·공급자 장애가
 * 함께 있다. 본문의 기계용 오류 코드가 목록에 있을 때만 WARN 이다. 본문이 없거나 읽을 수 없거나 모르는 코드면
 * ERROR 다. 본문은 분류에만 쓴다. 로그에 싣지 않는다.
 */

/** 객체에서 키 하나를 읽는다. 객체가 아니거나 읽다가 던지면 undefined. */
function read(body: unknown, key: string): unknown {
  try {
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
  } catch {
    return undefined;
  }
}

/*
 * Google 토큰 교환에는 판별 함수를 두지 않는다. invalid_grant 하나가 만료·재사용 code 와 redirect_uri 불일치를
 * 함께 뜻하고, 둘을 가르는 기계용 코드가 없다. 그래서 그 실패는 모두 ERROR 다.
 */

/**
 * Kakao 토큰 교환. KOE320 은 만료되었거나 이미 쓴 인가 코드다. 같은 invalid_grant 의 KOE303(redirect_uri 불일치)은
 * 설정 문제라 넣지 않는다.
 */
export function isClientKakaoTokenError(status: number, body: unknown): boolean {
  return status === 400 && read(body, 'error_code') === 'KOE320';
}

/**
 * Kakao 연결 해제. 토큰은 요청자가 보낸다. -401 은 무효·만료된 토큰, -101 은 이미 연결이 끊긴 사용자다.
 * 같은 400 의 -1(내부 오류)·-7(점검)·-10(한도)·-603(시간 초과)은 공급자 문제라 넣지 않는다.
 */
const CLIENT_KAKAO_UNLINK_CODES: ReadonlySet<unknown> = new Set([-401, -101]);

export function isClientKakaoUnlinkError(status: number, body: unknown): boolean {
  return (status === 400 || status === 401) && CLIENT_KAKAO_UNLINK_CODES.has(read(body, 'code'));
}

/**
 * PayPal capture 의 details[].issue 중 요청한 주문이 원인인 것: 없는 주문, 이미 capture 한 주문, 승인되지 않은 주문,
 * 구매자 결제수단 거절. AUTH_CAPTURE_NOT_ENABLED·TRANSACTION_RECEIVING_LIMIT_EXCEEDED 같은 판매자 계정 문제는 넣지 않는다.
 */
const CLIENT_PAYPAL_CAPTURE_ISSUES: ReadonlySet<unknown> = new Set([
  'INVALID_RESOURCE_ID',
  'ORDER_ALREADY_CAPTURED',
  'ORDER_NOT_APPROVED',
  'INSTRUMENT_DECLINED',
]);

/** issue 가 하나 이상 있고 모두 목록에 있을 때만 true. 판매자 쪽 issue 가 하나라도 섞이면 ERROR 다. */
export function isClientPayPalCaptureError(status: number, body: unknown): boolean {
  if (status !== 400 && status !== 404 && status !== 422) return false;
  try {
    const details = read(body, 'details');
    if (!Array.isArray(details) || details.length === 0) return false;
    return details.every((detail) => CLIENT_PAYPAL_CAPTURE_ISSUES.has(read(detail, 'issue')));
  } catch {
    return false;
  }
}
