import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { errors as joseErrors } from 'jose';
import { AuthApiError, AuthPKCECodeVerifierMissingError, AuthRetryableFetchError } from '@supabase/auth-js';

/**
 * #75: 누구나 반복해서 일으킬 수 있는 4xx 는 WARN(콘솔만), 운영자가 봐야 하는 실패는 ERROR(Sentry)로 남긴다.
 *
 * 레벨은 Console target 의 줄로 확인한다 — WARN 은 console.warn, ERROR 는 console.error 로 찍힌다.
 * WARN 이 Sentry 로 가지 않는 것은 __tests__/utils/log-safe-error.test.ts 가 운영 로거로 고정한다.
 */
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyAppleIdentityToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: mocks.signUp } }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/supabase/social/service', () => ({ getSocialAuthService: () => ({}) }));
vi.mock('@/lib/supabase/social/apple', async (original) => ({
  ...await original<typeof import('@/lib/supabase/social/apple')>(),
  verifyAppleIdentityToken: mocks.verifyAppleIdentityToken,
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  after: vi.fn(),
}));

import { POST as register } from '@/app/api/auth/register/route';
import { POST as exchangeCode } from '@/app/api/auth/exchange-code/route';
import { POST as kakao, DELETE as kakaoUnlink } from '@/app/api/auth/kakao/route';
import { POST as apple } from '@/app/api/auth/apple/route';

const post = (path: string, body: unknown, method = 'POST') =>
  new NextRequest(`https://www.picnic.fan${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const status = (code: number, body: unknown = {}) => new Response(JSON.stringify(body), { status: code });

/** 사건 코드가 어느 레벨로 찍혔는가. 둘 다 아니면 'none'. */
function levelOf(code: string): 'warn' | 'error' | 'none' {
  const lines = (spy: unknown) =>
    (spy as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
  if (lines(console.error).some((line) => line.endsWith(` ERROR: ${code}`))) return 'error';
  if (lines(console.warn).some((line) => line.endsWith(` WARN: ${code}`))) return 'warn';
  return 'none';
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('NEXT_PUBLIC_KAKAO_CLIENT_ID', 'kakao-client');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.signUp.mockReset();
  mocks.exchangeCodeForSession.mockReset();
  mocks.verifyAppleIdentityToken.mockReset();
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('register', () => {
  const signupWith = (error: unknown) =>
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error });
  const registration = () => post('/api/auth/register', { email: 'a@example.invalid', password: 'x' });

  it.each([
    ['중복 가입', new AuthApiError('User already registered', 422, 'user_already_exists')],
    ['약한 비밀번호', new AuthApiError('weak', 422, 'weak_password')],
    ['요청 rate limit', new AuthApiError('slow', 429, 'over_request_rate_limit')],
  ])('%s 는 400 과 WARN', async (_label, error) => {
    signupWith(error);
    const response = await register(registration());
    expect(response.status).toBe(400);
    expect(levelOf('auth.register.signup.failed')).toBe('warn');
  });

  it.each([
    ['이메일 발송 한도', new AuthApiError('limit', 429, 'over_email_send_rate_limit')],
    ['가입 비활성화', new AuthApiError('disabled', 422, 'signup_disabled')],
    ['공급자 5xx', new AuthApiError('down', 500, 'unexpected_failure')],
    ['네트워크 오류', new AuthRetryableFetchError('fetch failed', 0)],
  ])('%s 는 ERROR 로 남긴다', async (_label, error) => {
    signupWith(error);
    const response = await register(registration());
    expect(response.status).toBe(400);
    expect(levelOf('auth.register.signup.failed')).toBe('error');
  });

  it('JSON 이 아닌 본문은 400 이고 오류로 남기지 않는다', async () => {
    const response = await register(post('/api/auth/register', '{not json'));
    expect(response.status).toBe(400);
    expect(levelOf('auth.register.failed')).toBe('none');
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});

describe('exchange-code', () => {
  const exchange = () => exchangeCode(post('/api/auth/exchange-code', { code: 'some-code', provider: 'google' }));

  it.each([
    ['verifier 없음', new AuthPKCECodeVerifierMissingError()],
    ['만료된 code', new AuthApiError('expired', 404, 'flow_state_expired')],
    ['없는 code', new AuthApiError('missing', 404, 'flow_state_not_found')],
  ])('%s 는 400 과 WARN', async (_label, error) => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error });
    const response = await exchange();
    expect(response.status).toBe(400);
    expect(levelOf('auth.exchange_code.exchange.failed')).toBe('warn');
  });

  it('네트워크 오류는 ERROR 로 남긴다', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('fetch failed', 0) });
    const response = await exchange();
    expect(response.status).toBe(400);
    expect(levelOf('auth.exchange_code.exchange.failed')).toBe('error');
  });

  it('JSON 이 아닌 본문은 400 이고 오류로 남기지 않는다', async () => {
    const response = await exchangeCode(post('/api/auth/exchange-code', '{not json'));
    expect(response.status).toBe(400);
    expect(levelOf('auth.exchange_code.failed')).toBe('none');
  });
});

describe('google', () => {
  // 쓰이지 않던 POST(code·ID 토큰 교환)는 제거했다. 누구나 임의의 code 로 Sentry ERROR 를 만들 수 있었다.
  it('라우트는 OAuth 시작(GET)만 내보낸다 — POST 는 Next 가 405 로 거절한다', async () => {
    const route = await import('@/app/api/auth/google/route');
    expect(typeof route.GET).toBe('function');
    expect('POST' in route).toBe(false);
  });
});

describe('kakao', () => {
  it('Kakao 가 400 KOE320 으로 code 를 거절하면 502 와 WARN', async () => {
    mocks.fetch.mockResolvedValue(status(400, { error: 'invalid_grant', error_code: 'KOE320' }));
    const response = await kakao(post('/api/auth/kakao', { code: 'used-code' }));
    expect(response.status).toBe(502);
    expect(levelOf('auth.kakao.token_exchange.failed')).toBe('warn');
  });

  it.each([
    [400, { error: 'invalid_grant', error_code: 'KOE303' }],
    [400, {}],
    [401, { error: 'invalid_client', error_code: 'KOE010' }],
    [500, {}],
  ])('Kakao 토큰 교환 %s %j 는 ERROR', async (code, body) => {
    mocks.fetch.mockResolvedValue(status(code, body));
    const response = await kakao(post('/api/auth/kakao', { code: 'any' }));
    expect(response.status).toBe(502);
    expect(levelOf('auth.kakao.token_exchange.failed')).toBe('error');
  });

  it.each([
    [401, { code: -401 }],
    [400, { code: -101 }],
  ])('연결 해제에서 Kakao 가 요청자의 토큰·연결 상태로 %s %j 를 주면 WARN', async (code, body) => {
    mocks.fetch.mockResolvedValue(status(code, body));
    const response = await kakaoUnlink(post('/api/auth/kakao', { accessToken: 'stale' }, 'DELETE'));
    expect(response.status).toBe(502);
    expect(levelOf('auth.kakao.unlink.failed')).toBe('warn');
  });

  it.each([
    [400, { code: -1 }],
    [400, { code: -7 }],
    [400, { code: -10 }],
    [400, { code: -603 }],
    [400, {}],
    [500, { code: -401 }],
  ])('연결 해제의 Kakao %s %j 는 ERROR — 공급자 장애·한도·모르는 코드', async (code, body) => {
    mocks.fetch.mockResolvedValue(status(code, body));
    const response = await kakaoUnlink(post('/api/auth/kakao', { accessToken: 'token' }, 'DELETE'));
    expect(response.status).toBe(502);
    expect(levelOf('auth.kakao.unlink.failed')).toBe('error');
  });

  it.each([
    ['POST', 'auth.kakao.post.failed'],
    ['DELETE', 'auth.kakao.delete.failed'],
  ])('%s 의 JSON 이 아닌 본문은 400 이고 오류로 남기지 않는다', async (method, code) => {
    const request = post('/api/auth/kakao', '{not json', method);
    const response = await (method === 'POST' ? kakao(request) : kakaoUnlink(request));
    expect(response.status).toBe(400);
    expect(levelOf(code)).toBe('none');
  });
});

describe('apple', () => {
  it('위조·만료된 ID 토큰은 401 과 WARN', async () => {
    mocks.verifyAppleIdentityToken.mockRejectedValue(new joseErrors.JWTExpired('expired', {}));
    const response = await apple(post('/api/auth/apple', { id_token: 'expired' }));
    expect(response.status).toBe(401);
    expect(levelOf('auth.apple.token_verify.failed')).toBe('warn');
  });

  it('JWKS 를 가져오지 못하면 401 이지만 ERROR', async () => {
    mocks.verifyAppleIdentityToken.mockRejectedValue(new TypeError('fetch failed'));
    const response = await apple(post('/api/auth/apple', { id_token: 'token' }));
    expect(response.status).toBe(401);
    expect(levelOf('auth.apple.token_verify.failed')).toBe('error');
  });

  it('JSON 이 아닌 본문은 400 이고 오류로 남기지 않는다', async () => {
    const response = await apple(post('/api/auth/apple', '{not json'));
    expect(response.status).toBe(400);
    expect(levelOf('auth.apple.failed')).toBe('none');
  });
});

describe('공급자 응답 본문은 분류에만 쓰고 로그에 싣지 않는다', () => {
  it.each([
    ['kakao', () => kakao(post('/api/auth/kakao', { code: 'c' }))],
    ['kakao unlink', () => kakaoUnlink(post('/api/auth/kakao', { accessToken: 't' }, 'DELETE'))],
  ])('%s', async (_label, call) => {
    mocks.fetch.mockResolvedValue(status(400, { error: 'invalid_grant', error_code: 'KOE320', code: -401, error_description: 'private-canary', msg: 'private-canary' }));
    await call();
    const printed = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls]);
    expect(printed).not.toContain('private-canary');
  });
});
