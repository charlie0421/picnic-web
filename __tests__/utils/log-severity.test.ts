import { describe, expect, it } from 'vitest';
import { errors as joseErrors } from 'jose';
import { AuthApiError, AuthPKCECodeVerifierMissingError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/auth-js';
import { isClientAuthError, isClientJoseError } from '@/utils/log-severity';

describe('isClientAuthError — 운영자 조치가 필요 없는 Supabase auth 오류만 고른다', () => {
  it.each([
    ['중복 가입', new AuthApiError('User already registered', 422, 'user_already_exists')],
    ['중복 이메일', new AuthApiError('exists', 422, 'email_exists')],
    ['약한 비밀번호', new AuthWeakPasswordError('weak', 422, ['length'])],
    ['형식 오류', new AuthApiError('bad', 400, 'validation_failed')],
    ['잘못된 이메일', new AuthApiError('bad', 400, 'email_address_invalid')],
    ['요청 rate limit', new AuthApiError('slow down', 429, 'over_request_rate_limit')],
    ['만료된 code', new AuthApiError('expired', 404, 'flow_state_expired')],
    ['없는 code', new AuthApiError('missing', 404, 'flow_state_not_found')],
    ['verifier 불일치', new AuthApiError('bad', 400, 'bad_code_verifier')],
    ['verifier 없음', new AuthPKCECodeVerifierMissingError()],
  ])('%s 는 클라이언트 오류다', (_label, error) => {
    expect(isClientAuthError(error)).toBe(true);
  });

  it.each([
    ['이메일 발송 한도 — 운영자가 SMTP 를 봐야 한다', new AuthApiError('limit', 429, 'over_email_send_rate_limit')],
    ['가입 비활성화 — 설정 오류', new AuthApiError('disabled', 422, 'signup_disabled')],
    ['허용되지 않은 이메일 — SMTP 설정', new AuthApiError('no', 400, 'email_address_not_authorized')],
    ['목록에 없는 4xx 코드', new AuthApiError('?', 400, 'something_new')],
    ['코드 없는 4xx', new AuthApiError('?', 400, undefined)],
    ['5xx', new AuthApiError('down', 500, 'unexpected_failure')],
    ['네트워크 재시도 오류', new AuthRetryableFetchError('fetch failed', 0)],
    ['일반 Error', new Error('boom')],
    ['코드는 맞지만 status 가 5xx', Object.assign(new Error('x'), { status: 503, code: 'user_already_exists' })],
    ['status 가 문자열', Object.assign(new Error('x'), { status: '422', code: 'user_already_exists' })],
  ])('%s 는 클라이언트 오류가 아니다', (_label, error) => {
    expect(isClientAuthError(error)).toBe(false);
  });

  it('객체가 아니거나 읽다가 던지는 값은 클라이언트 오류가 아니다', () => {
    expect(isClientAuthError(undefined)).toBe(false);
    expect(isClientAuthError('user_already_exists')).toBe(false);
    const hostile = new Proxy({}, { get: () => { throw new Error('private'); } });
    expect(isClientAuthError(hostile)).toBe(false);
  });
});

describe('isClientJoseError — 요청자가 보낸 토큰의 결함만 고른다', () => {
  it.each([
    ['만료', new joseErrors.JWTExpired('expired', { exp: 1 })],
    ['형식 오류 JWT', new joseErrors.JWTInvalid('bad')],
    ['형식 오류 JWS', new joseErrors.JWSInvalid('bad')],
    ['서명 불일치', new joseErrors.JWSSignatureVerificationFailed()],
    ['허용되지 않은 alg', new joseErrors.JOSEAlgNotAllowed('alg')],
    ['없는 kid', new joseErrors.JWKSNoMatchingKey()],
    ['nbf 클레임', new joseErrors.JWTClaimValidationFailed('nbf', {}, 'nbf', 'check_failed')],
  ])('%s 는 클라이언트 오류다', (_label, error) => {
    expect(isClientJoseError(error)).toBe(true);
  });

  it.each([
    ['aud 불일치 — 설정 오류일 수 있다', new joseErrors.JWTClaimValidationFailed('aud', {}, 'aud', 'check_failed')],
    ['iss 불일치', new joseErrors.JWTClaimValidationFailed('iss', {}, 'iss', 'check_failed')],
    ['JWKS 시간 초과', new joseErrors.JWKSTimeout()],
    ['JWKS 형식 오류', new joseErrors.JWKSInvalid('bad')],
    ['JOSE 일반 오류', new joseErrors.JOSEError('generic')],
    ['네트워크 오류', new TypeError('fetch failed')],
  ])('%s 는 클라이언트 오류가 아니다', (_label, error) => {
    expect(isClientJoseError(error)).toBe(false);
  });

  it('읽다가 던지는 값은 클라이언트 오류가 아니다', () => {
    const hostile = new Proxy({}, { get: () => { throw new Error('private'); } });
    expect(isClientJoseError(hostile)).toBe(false);
  });
});
