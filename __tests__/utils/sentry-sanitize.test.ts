import { describe, it, expect } from 'vitest';
import { sanitizeSentryEvent, sanitizeBreadcrumb, sanitizeUrlValue, isSensitiveKey } from '@/utils/sentry-sanitize';

describe('isSensitiveKey — 단어 경계', () => {
  it('인증 관련 키를 민감으로 본다', () => {
    for (const k of ['authorization', 'Authorization', 'cookie', 'set-cookie', 'apikey', 'x-api-key', 'accessToken', 'refresh_token', 'password', 'clientSecret']) {
      expect(isSensitiveKey(k), k).toBe(true);
    }
  });

  it('사용자 식별자 키를 민감으로 오인하지 않는다', () => {
    // 'auth' 부분 일치가 authUserId 를 지우면 진단 문맥이 비대칭이 된다.
    for (const k of ['authUserId', 'authorId', 'customUserId', 'userId', 'orderID', 'tokenCount']) {
      expect(isSensitiveKey(k), k).toBe(false);
    }
  });
});

describe('sanitizeUrlValue', () => {
  it('쿼리스트링을 제거한다', () => {
    expect(sanitizeUrlValue('https://x.test/cb?code=SECRET')).not.toContain('SECRET');
  });
  it('경로는 유지한다', () => {
    expect(sanitizeUrlValue('https://x.test/api/auth/callback?code=S')).toContain('/api/auth/callback');
  });
  it('URL 이 아니면 그대로 둔다', () => {
    expect(sanitizeUrlValue('그냥 문자열')).toBe('그냥 문자열');
  });
});

describe('sanitizeSentryEvent', () => {
  it('request 의 민감 헤더를 제거한다', () => {
    const e = sanitizeSentryEvent({
      request: { headers: { authorization: 'Bearer LEAK', cookie: 'sb=LEAK', accept: 'application/json' } },
    } as any);
    const s = JSON.stringify(e);
    expect(s).not.toContain('Bearer LEAK');
    expect(s).not.toContain('sb=LEAK');
    expect(s).toContain('application/json');
  });

  it('referer 헤더 값의 쿼리스트링을 제거한다', () => {
    const e = sanitizeSentryEvent({
      request: { headers: { referer: 'https://x.test/cb?code=SECRET-REF' } },
    } as any);
    expect(JSON.stringify(e)).not.toContain('SECRET-REF');
  });

  it('request 의 cookies / query_string / url 을 정리한다', () => {
    const e = sanitizeSentryEvent({
      request: { url: 'https://x.test/p?token=LEAK', query_string: 'token=LEAK', cookies: { sb: 'LEAK' } },
    } as any);
    const s = JSON.stringify(e);
    expect(s).not.toContain('LEAK');
  });

  it('user 는 id 만 남긴다', () => {
    const e = sanitizeSentryEvent({
      user: { id: 'u1', email: 'a@b.com', ip_address: '203.0.113.9', username: 'nick' },
    } as any);
    expect(e.user).toEqual({ id: 'u1' });
  });

  it('message 안의 URL 쿼리스트링을 제거한다', () => {
    const e = sanitizeSentryEvent({
      message: 'API 요청 실패: https://x.test/cb?code=SECRET-MSG',
    } as any);
    expect(JSON.stringify(e)).not.toContain('SECRET-MSG');
  });

  it('exception 의 value 와 stack frame 의 URL 도 정리한다', () => {
    const e = sanitizeSentryEvent({
      exception: { values: [{ type: 'Error', value: 'failed https://x.test/a?token=SECRET-EXC' }] },
    } as any);
    expect(JSON.stringify(e)).not.toContain('SECRET-EXC');
  });

  it('extra / contexts 의 민감 키를 제거한다', () => {
    const e = sanitizeSentryEvent({
      extra: { accessToken: 'LEAK', voteId: 7 },
      contexts: { log: { password: 'LEAK', operation: 'vote' } },
    } as any);
    const s = JSON.stringify(e);
    expect(s).not.toContain('LEAK');
    expect(s).toContain('vote');
    expect(s).toContain('7');
  });

  it('진단에 필요한 사용자 ID 계열은 남긴다', () => {
    const e = sanitizeSentryEvent({ extra: { authUserId: 'u2', customUserId: 'u1' } } as any);
    const s = JSON.stringify(e);
    expect(s).toContain('u2');
    expect(s).toContain('u1');
  });

  it('순환 참조가 있어도 throw 하지 않는다', () => {
    const circular: any = { a: 1 }; circular.self = circular;
    expect(() => sanitizeSentryEvent({ extra: circular } as any)).not.toThrow();
  });

  it('getter 가 throw 해도 이벤트를 버리지 않는다', () => {
    const evil: any = {};
    Object.defineProperty(evil, 'boom', { get() { throw new Error('x'); }, enumerable: true });
    const e = sanitizeSentryEvent({ message: 'ok', extra: evil } as any);
    expect(e).toBeTruthy();
    expect(e.message).toBe('ok');
  });
});

describe('sanitizeBreadcrumb', () => {
  it('console breadcrumb 의 민감 값을 제거한다', () => {
    const b = sanitizeBreadcrumb({
      category: 'console',
      message: 'error a@b.com https://x.test/p?token=LEAK',
      data: { accessToken: 'LEAK2' },
    } as any);
    const s = JSON.stringify(b);
    expect(s).not.toContain('LEAK');
    expect(s).not.toContain('LEAK2');
  });

  it('fetch breadcrumb 의 URL 쿼리스트링을 제거한다', () => {
    const b = sanitizeBreadcrumb({ category: 'fetch', data: { url: 'https://x.test/a?token=LEAK' } } as any);
    expect(JSON.stringify(b)).not.toContain('LEAK');
  });
});
