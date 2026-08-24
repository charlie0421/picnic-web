import { describe, it, expect } from 'vitest';
import { isClientTokenError } from '@/utils/jose-error-severity';

function joseError(code: string, name = 'JOSEError') {
  const e = new Error('boom') as Error & { code: string };
  e.name = name;
  e.code = code;
  return e;
}

describe('isClientTokenError', () => {
  it('클라이언트가 보낸 토큰 문제는 true', () => {
    // 위조·만료 토큰은 공격자가 임의로 발생시킬 수 있다. 알림 대상이 아니다.
    for (const c of [
      'ERR_JWT_EXPIRED',
      'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
      'ERR_JWT_CLAIM_VALIDATION_FAILED',
      'ERR_JWS_INVALID',
      'ERR_JWT_INVALID',
    ]) {
      expect(isClientTokenError(joseError(c)), c).toBe(true);
    }
  });

  it('JWKS 조회 실패는 false — 서버·인프라 장애다', () => {
    // 이게 발생하면 소셜 로그인이 전면 실패한다. 반드시 알림을 받아야 한다.
    for (const c of [
      'ERR_JWKS_NO_MATCHING_KEY',
      'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
      'ERR_JWKS_TIMEOUT',
      'ERR_JOSE_GENERIC',
    ]) {
      expect(isClientTokenError(joseError(c)), c).toBe(false);
    }
  });

  it('네트워크 오류 등 code 없는 오류는 false', () => {
    expect(isClientTokenError(new Error('fetch failed'))).toBe(false);
  });

  it('Error 가 아닌 값은 false', () => {
    expect(isClientTokenError(undefined)).toBe(false);
    expect(isClientTokenError('string')).toBe(false);
  });

  it('code getter 가 throw 해도 false 를 반환하고 예외를 던지지 않는다', () => {
    const e = new Error('x');
    Object.defineProperty(e, 'code', { get() { throw new Error('trap'); } });
    expect(() => isClientTokenError(e)).not.toThrow();
    expect(isClientTokenError(e)).toBe(false);
  });
});
