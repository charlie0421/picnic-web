// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * middleware 가 OAuth 콜백에서 PKCE 검증값을 지우지 않으면(__tests__/middleware/auth-callback-session.test.ts),
 * 폐기된 세션 쿠키가 남은 브라우저도 다시 로그인할 수 있어야 한다. 그 전제를 실제 라우트로 고정한다.
 * - 코드 교환은 검증값으로 성공한다.
 * - 새 세션 쿠키는 운영 도메인(.picnic.fan)에 쓰여, 같은 이름·도메인의 폐기된 쿠키를 덮어쓴다.
 * 실제 @supabase/ssr·auth-js 를 쓰고 Supabase 서버만 가짜 fetch 로 바꾼다.
 */
const SUPABASE_URL = 'https://api.picnic.test';
const STORAGE_KEY = 'sb-api-auth-token';
const USER_ID = '00000000-0000-0000-0000-000000000001';

const base64url = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const encoded = (value: unknown) => `base64-${base64url(JSON.stringify(value))}`;
const jwt = (exp: number) =>
  `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ sub: USER_ID, exp, role: 'authenticated', aud: 'authenticated' }))}.signature`;

const now = () => Math.floor(Date.now() / 1000);
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'user@example.test' };

let requestCookies: Map<string, string>;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name)! } : undefined) }),
}));

import { GET } from '@/app/api/auth/callback/route';

describe('/api/auth/callback with a revoked session cookie and a preserved verifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.picnic.fan');
    requestCookies = new Map([
      [STORAGE_KEY, encoded({ access_token: jwt(now() - 3600), refresh_token: 'revoked-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now() - 3600, user })],
      [`${STORAGE_KEY}-code-verifier`, encoded('pkce-verifier-value')],
    ]);
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/token?grant_type=pkce')) {
        return new Response(
          JSON.stringify({ access_token: jwt(now() + 3600), refresh_token: 'fresh-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, user }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/token?grant_type=refresh_token')) {
        return new Response(
          JSON.stringify({ code: 'refresh_token_already_used', error_code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used' }),
          { status: 400, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } },
        );
      }
      if (url.includes('/rest/v1/user_profiles')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('exchanges the code and writes the new session to .picnic.fan', async () => {
    const res = await GET(new Request('https://www.picnic.fan/api/auth/callback?code=oauth-code&next=%2Fko%2Fvote'));

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/token?grant_type=pkce'))).toBe(true);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://www.picnic.fan/ko/vote');
    const session = res.headers.getSetCookie().find((line) => line.startsWith(`${STORAGE_KEY}=`));
    expect(session).toBeDefined();
    expect(session).toMatch(new RegExp(`^${STORAGE_KEY}=base64-[A-Za-z0-9_-]+;`));
    expect(session).toMatch(/Domain=\.picnic\.fan/i);
    expect(session).not.toMatch(/Max-Age=0/i);
  });

  it('control: without the verifier the exchange never reaches Supabase and the user lands on the error path', async () => {
    requestCookies.delete(`${STORAGE_KEY}-code-verifier`);
    const res = await GET(new Request('https://www.picnic.fan/api/auth/callback?code=oauth-code&next=%2Fko%2Fvote'));

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/token?grant_type=pkce'))).toBe(false);
    expect(res.headers.get('location')).toMatch(/^https:\/\/www\.picnic\.fan\/auth\/auth-code-error\?/);
  });
});
