import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getClaimsMock = vi.fn();
const maybeSingleMock = vi.fn();
const signOutMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: getClaimsMock, signOut: signOutMock },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }),
  }),
}));

import { middleware } from '@/middleware';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const KAKAOTALK_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 KAKAOTALK 10.0.0';

const request = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'user-agent': BROWSER_UA, host: 'localhost', ...headers },
  });

/** Location 을 경로+쿼리로 돌려준다. 리다이렉트가 아니면 null. 출처가 요청과 다르면 실패시킨다. */
const locationOf = (res: Response): string | null => {
  const header = res.headers.get('location');
  if (!header) return null;
  const url = new URL(header);
  expect(url.origin).toBe('http://localhost');
  return `${url.pathname}${url.search}`;
};

describe('middleware — 언어 접두어 라우팅', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    getClaimsMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['/', '/?error=x'])('%s 는 리다이렉트하지 않는다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBeNull();
  });

  it('접두어 없는 경로는 선호 언어를 붙이고 쿼리를 보존한다', async () => {
    const res = await middleware(request('/login?error=x'));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe('/en/login?error=x');
  });

  it.each([
    ['쿠키', { cookie: 'locale=ja' }, '/ja/login?error=x'],
    ['Accept-Language', { 'accept-language': 'ko-KR,ko;q=0.9' }, '/ko/login?error=x'],
    ['같은 호스트 Referer', { referer: 'http://localhost/th/vote', cookie: 'locale=ja' }, '/th/login?error=x'],
    ['다른 호스트 Referer 는 무시', { referer: 'https://evil.example/th/vote', cookie: 'locale=ja' }, '/ja/login?error=x'],
  ])('선호 언어 신호: %s', async (_label, headers, expected) => {
    expect(locationOf(await middleware(request('/login?error=x', headers)))).toBe(expected);
  });

  it.each(['/download', '/rewards/1', '/mypage/qna', '/vote/295', '/vote', '/mypage', '/concert2025'])(
    '%s → /en%s',
    async (path) => {
      expect(locationOf(await middleware(request(path)))).toBe(`/en${path}`);
    },
  );

  it.each([
    ['/KO/vote?a=1', '/ko/vote?a=1'],
    ['/zh-TW/rewards', '/zh-tw/rewards'],
    ['/zh/vote', '/zh-cn/vote'],
    ['/fil-PH/vote', '/tl/vote'],
    ['/%6Bo/vote', '/ko/vote'],
    ['/%65n/vote', '/en/vote'],
    ['/%7A%68-tw/vote/295', '/zh-tw/vote/295'],
    ['/KO', '/ko'],
  ])('표기 변형 %s → %s', async (path, expected) => {
    const res = await middleware(request(path, { cookie: 'locale=ja' }));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(expected);
  });

  it.each([
    '/xx/rewards', '/fr/vote', '/wp-admin', '/.env', '/auth', '/auth/foo', '/ads', '/open-in-browser/x',
    '/api', '/my-page', '/sitemap-foo.xml', '/.well-known/x', '/auth/callback/google/x',
  ])('정규 언어가 아닌 %s 는 /en 을 붙인다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBe(`/en${path}`);
  });

  it.each([
    ['/ko/auth/callback/google?code=c', '/auth/callback/google?code=c'],
    ['/ko/auth/callback', '/auth/callback'],
  ])('언어가 붙은 콜백 %s 는 언어를 뗀다', async (path, expected) => {
    const res = await middleware(request(path));
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(expected);
  });

  it.each(['/ko/authx', '/ko/auth/callbackx', '/ko/auth/callback/a/b'])('%s 는 통과한다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBeNull();
  });

  it.each([
    '/auth/callback', '/auth/callback/apple', '/auth/loading', '/ads/shortform/player', '/open-in-browser',
    '/supabase-proxy/rest/v1', '/_next/data/x.json', '/_vercel/insights/script.js',
  ])('통과 목록 %s 는 리다이렉트하지 않는다', async (path) => {
    expect(locationOf(await middleware(request(path)))).toBeNull();
  });

  describe('리다이렉트 응답', () => {
    it('Cache-Control 은 private, no-store 이고 Set-Cookie 가 없다', async () => {
      const res = await middleware(request('/login'));
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    // Review Focus 1: 세션 쿠키가 있어도 리다이렉트는 세션을 건드리지 않는다
    it('세션 쿠키가 있는 요청도 getClaims·프로필 조회 없이 끝난다', async () => {
      getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
      const res = await middleware(
        request('/mypage/qna', { cookie: 'sb-example-auth-token=base64-abc; locale=ko' }),
      );
      expect(locationOf(res)).toBe('/ko/mypage/qna');
      expect(getClaimsMock).not.toHaveBeenCalled();
      expect(maybeSingleMock).not.toHaveBeenCalled();
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    // Review Focus 2: 쿼리는 한 글자도 바뀌지 않는다
    it('특수문자가 든 쿼리를 그대로 보존한다', async () => {
      const query = '?next=%2Fko%2Fvote&error=a+b&x=%EA%B0%80&empty=&flag';
      expect(locationOf(await middleware(request(`/login${query}`)))).toBe(`/en/login${query}`);
    });

    // Review Focus 5: 메서드를 바꾸는 302·303 이 아니다
    it.each(['POST', 'HEAD', 'PUT'])('%s 도 307 이다', async (method) => {
      const res = await middleware(request('/login', {}, method));
      expect(res.status).toBe(307);
      expect(locationOf(res)).toBe('/en/login');
    });

    it('정규 언어 경로의 POST 는 그대로 통과한다', async () => {
      expect(locationOf(await middleware(request('/ko/login', {}, 'POST')))).toBeNull();
    });

    // Review Focus 4: 출처를 속이려는 경로
    it.each(['//evil.com/x', '/%2F%2Fevil.com/x', '/%5Cevil.com'])('%s 의 Location 은 같은 출처다', async (path) => {
      const res = await middleware(request(path));
      const location = new URL(res.headers.get('location')!);
      expect(location.origin).toBe('http://localhost');
      expect(location.pathname.startsWith('/en/')).toBe(true);
    });
  });

  describe('인앱 브라우저', () => {
    it('접두어 없는 주소는 먼저 정규 주소로 간다', async () => {
      const res = await middleware(request('/login', { 'user-agent': KAKAOTALK_UA }));
      expect(locationOf(res)).toBe('/en/login');
    });

    it('정규 주소가 된 뒤에 안내 페이지로 간다', async () => {
      const res = await middleware(request('/en/login', { 'user-agent': KAKAOTALK_UA }));
      expect(locationOf(res)).toBe('/open-in-browser?returnTo=%2Fen%2Flogin');
    });

    it.each(['/auth/callback/apple', '/open-in-browser', '/_vercel/insights/script.js'])(
      '통과 목록 %s 는 인앱에서도 언어 리다이렉트를 하지 않는다',
      async (path) => {
        const location = locationOf(await middleware(request(path, { 'user-agent': KAKAOTALK_UA })));
        expect(location === null || location.startsWith('/open-in-browser')).toBe(true);
      },
    );
  });

  it('탈퇴 계정이 언어 없는 통과 경로를 요청하면 쿠키 언어의 로그인으로 간다 (현행 순서)', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
    maybeSingleMock.mockResolvedValue({ data: { deleted_at: '2026-09-01T00:00:00Z' } });
    const res = await middleware(request('/auth/loading', { cookie: 'locale=ja' }));
    expect(signOutMock).toHaveBeenCalled();
    expect(locationOf(res)).toBe('/ja/login?error=withdrawn');
  });
});
