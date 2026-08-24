/**
 * jose 오류의 심각도 판정.
 *
 * ID 토큰 검증 catch 에는 두 부류가 섞여 들어온다.
 *
 *   (a) 클라이언트가 보낸 토큰 문제 — 위조·만료. 공격자가 임의로
 *       발생시킬 수 있으므로 알림 대상이 아니다.
 *   (b) 서버·인프라 문제 — JWKS 엔드포인트 불통, audience env 누락.
 *       발생하면 소셜 로그인이 전면 실패하므로 반드시 알림을 받아야 한다.
 *
 * 둘을 구분 없이 한 레벨로 기록하면 (b)가 (a)의 소음에 묻힌다.
 */

/** 클라이언트가 유발하는 토큰 오류 코드. jose 의 JOSEErrorCode 기준. */
const CLIENT_TOKEN_ERROR_CODES = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWE_INVALID',
  'ERR_JWE_DECRYPTION_FAILED',
]);

/**
 * 클라이언트가 보낸 토큰 자체의 문제인가.
 *
 * false 면 서버·인프라 장애일 수 있으므로 error 로 기록해야 한다.
 * 판정할 수 없으면 false 를 반환한다 — 모르는 것을 조용히 넘기지 않는다.
 */
export function isClientTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  try {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === 'string' && CLIENT_TOKEN_ERROR_CODES.has(code);
  } catch {
    return false;
  }
}
