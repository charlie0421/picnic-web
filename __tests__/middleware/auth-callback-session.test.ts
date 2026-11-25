// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

/**
 * 실제 @supabase/ssr 와 auth-js 로 middleware 를 돌린다. Supabase Auth 서버만 가짜 fetch 로 바꾼다.
 *
 * 2026-11-25 운영 장애: 한 브라우저에 같은 이름의 로그인 쿠키가 두 벌 있으면(`.picnic.fan` 과 호스트 전용)
 * 브라우저와 서버가 서로 다른 refresh token 으로 갱신한다. Supabase 가 재사용으로 판단해 세션을 폐기하면
 * 그 뒤 모든 요청에서 middleware 의 갱신이 `refresh_token_already_used` 로 실패한다. 실패하면 auth-js 가
 * 세션을 지우면서 PKCE 코드 검증값 쿠키까지 지운다(`_removeSession` → `removeAllPKCEVerifiers`).
 * OAuth 콜백 요청에서 이 일이 일어나면 `/api/auth/callback` 의 코드 교환이 검증값 없이 실패해,
 * 사용자는 쿠키를 직접 지우기 전까지 다시 로그인할 수 없다.
 */
const SUPABASE_URL = 'https://api.picnic.test';
const STORAGE_KEY = 'sb-api-auth-token';
const VERIFIER_KEY = `${STORAGE_KEY}-code-verifier`;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const base64url = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const encoded = (value: unknown) => `base64-${base64url(JSON.stringify(value))}`;

function expiredSessionCookie() {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000001', exp: past, role: 'authenticated' }));
  return encoded({
    access_token: `${header}.${payload}.signature`,
    refresh_token: 'already-used-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: past,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  });
}

const cookieHeader = [
  `${STORAGE_KEY}=${expiredSessionCookie()}`,
  `${VERIFIER_KEY}=${encoded('pkce-verifier-value')}`,
].join('; ');

const request = (path: string) =>
  new NextRequest(`https://www.picnic.fan${path}`, {
    headers: { 'user-agent': BROWSER_UA, cookie: cookieHeader },
  });

const refreshCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/token?grant_type=refresh_token'));

const deletedCookies = (res: Response) =>
  res.headers
    .getSetCookie()
    .filter((line) => /=;|=(?:\s|;|$)/.test(line.split(';')[0] + ';') || /max-age=0/i.test(line))
    .map((line) => line.split('=')[0]);

describe('middleware and a stale session on the OAuth callback', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/token?grant_type=refresh_token')) {
        return new Response(
          JSON.stringify({ code: 'refresh_token_already_used', error_code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used' }),
          { status: 400, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } },
        );
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('control: on an ordinary page the failed refresh removes the session and the verifier', async () => {
    const res = await middleware(request('/ko/vote'));

    expect(refreshCalls(fetchMock).length).toBeGreaterThan(0);
    expect(deletedCookies(res)).toEqual(expect.arrayContaining([STORAGE_KEY, VERIFIER_KEY]));
  });

  it.each([
    '/auth/callback/google?code=oauth-code',
    '/auth/callback/kakao?code=oauth-code&returnTo=%2Fko%2Fvote',
    '/auth/callback/apple?code=oauth-code',
    '/auth/callback/google/?code=oauth-code',
    '/auth/callback?code=oauth-code',
  ])('passes %s through untouched: no refresh, no cookie change, no redirect', async (path) => {
    const res = await middleware(request(path));

    expect(refreshCalls(fetchMock)).toHaveLength(0);
    expect(deletedCookies(res)).not.toContain(VERIFIER_KEY);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(['/auth/callback/google/extra', '/auth/callbacks/google', '/ko/auth/callback/google'])(
    'does not extend the bypass to %s',
    async (path) => {
      const res = await middleware(request(path));
      const bypassed = refreshCalls(fetchMock).length === 0 && res.headers.get('x-middleware-next') === '1';
      expect(bypassed).toBe(false);
    },
  );
});
