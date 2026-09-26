import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const signOutMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock, signOut: signOutMock },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  }),
}));

import { middleware } from '@/middleware';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    headers: { 'user-agent': BROWSER_UA, ...headers },
  });

/**
 * `NextResponse.next({ request: { headers } })` 는 덮어쓸 요청 헤더를
 * `x-middleware-override-headers`(이름 목록)와 `x-middleware-request-<name>` 으로 싣는다.
 * 목록에 없는 요청 헤더는 서버가 지운다 — 그래서 "전달되는 요청 헤더"는 이 목록이 전부다.
 */
const forwardedRequestHeaders = (res: Response): Map<string, string> => {
  const names = (res.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .filter(Boolean);
  return new Map(
    names.map((name) => [name, res.headers.get(`x-middleware-request-${name}`) ?? '']),
  );
};

/**
 * 레이아웃은 `x-locale` 로 `<html lang>` 을, `x-pathname`/`x-url` 로 VoteLite·광고 분기를 정한다.
 * 이 헤더들은 middleware 만 만들 수 있어야 한다 — 클라이언트가 보낸 값은 신뢰하지 않는다.
 */
describe('middleware — 로케일 요청 헤더', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Supabase 미설정: 인증 단계 전에 반환되는 경로 (헤더 처리만 관측)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['/en/vote', 'en'],
    ['/ja/vote', 'ja'],
    ['/ko/vote/295', 'ko'],
    ['/zh-tw/vote/295', 'zh-tw'],
    ['/zh-cn', 'zh-cn'],
    ['/my/mypage', 'my'],
  ])('%s → x-locale=%s 를 주입한다', async (path, locale) => {
    const res = await middleware(request(path));
    expect(forwardedRequestHeaders(res).get('x-locale')).toBe(locale);
  });

  it.each([
    ['/%65n/vote', 'en'],
    ['/%7A%68-tw/vote/295', 'zh-tw'],
    ['/%6Bo/vote', 'ko'],
  ])('percent-encoded 로케일 세그먼트 %s 도 Next 라우팅과 같게 x-locale=%s', async (path, locale) => {
    const res = await middleware(request(path));
    expect(forwardedRequestHeaders(res).get('x-locale')).toBe(locale);
  });

  it('잘못된 percent-encoding 세그먼트는 x-locale 없이 통과한다', async () => {
    const res = await middleware(request('/%E0%A4%A/vote', { 'x-locale': 'ja' }));
    expect(res.status).toBe(200);
    expect(forwardedRequestHeaders(res).has('x-locale')).toBe(false);
  });

  it('클라이언트가 보낸 x-locale 은 경로 값으로 덮어쓴다', async () => {
    const res = await middleware(request('/ja/vote', { 'x-locale': 'ko' }));
    expect(forwardedRequestHeaders(res).get('x-locale')).toBe('ja');
  });

  it('로케일이 없는 경로는 인바운드 x-locale 을 지우고 새로 만들지 않는다', async () => {
    const res = await middleware(request('/vote', { 'x-locale': 'ja' }));
    expect(forwardedRequestHeaders(res).has('x-locale')).toBe(false);
  });

  it('지원하지 않는 로케일 접두사는 x-locale 을 만들지 않는다', async () => {
    const res = await middleware(request('/xx/vote', { 'x-locale': 'en' }));
    expect(forwardedRequestHeaders(res).has('x-locale')).toBe(false);
  });

  it('인바운드 x-pathname·x-url 은 전달하지 않는다 (VoteLite·광고 분기 위조 차단)', async () => {
    const res = await middleware(
      request('/en/vote/295', {
        'x-pathname': '/ko/vote/295',
        'x-url': 'https://evil.example/ko/vote/295',
      }),
    );
    const forwarded = forwardedRequestHeaders(res);
    expect(forwarded.has('x-pathname')).toBe(false);
    expect(forwarded.has('x-url')).toBe(false);
  });

  it('x-pathname 은 주입하지 않는다 (경로 분기 사문 상태 유지)', async () => {
    const res = await middleware(request('/en/vote/295'));
    expect(forwardedRequestHeaders(res).has('x-pathname')).toBe(false);
  });

  it('그 밖의 요청 헤더는 그대로 전달한다', async () => {
    const res = await middleware(
      request('/en/vote', { cookie: 'locale=en', 'accept-language': 'en-US,en;q=0.9' }),
    );
    const forwarded = forwardedRequestHeaders(res);
    expect(forwarded.get('cookie')).toBe('locale=en');
    expect(forwarded.get('accept-language')).toBe('en-US,en;q=0.9');
    expect(forwarded.get('user-agent')).toBe(BROWSER_UA);
  });
});

describe('middleware — 기존 동작 불변', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('인앱 브라우저는 /open-in-browser 로 redirect 한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const res = await middleware(
      request('/ko/vote?status=ongoing', {
        'user-agent': 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 KAKAOTALK 10.0.0',
      }),
    );
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/open-in-browser');
    expect(location.searchParams.get('returnTo')).toBe('/ko/vote?status=ongoing');
  });

  it('SNS 미리보기 봇은 인앱 패턴이 있어도 redirect 하지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const res = await middleware(
      request('/ko/vote/295', { 'user-agent': 'facebookexternalhit/1.1 (FBAN)' }),
    );
    expect(res.headers.get('location')).toBeNull();
    expect(forwardedRequestHeaders(res).get('x-locale')).toBe('ko');
  });

  describe('확장자가 붙은 HTML 경로 (페이지로 라우팅됨)', () => {
    const KAKAOTALK_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 KAKAOTALK 10.0.0';

    it.each(['/ko/vote/295.0', '/ko/vote/295.json'])(
      '인앱 브라우저는 %s 도 /open-in-browser 로 redirect 한다',
      async (path) => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        const res = await middleware(request(path, { 'user-agent': KAKAOTALK_UA }));
        expect(res.status).toBe(307);
        const location = new URL(res.headers.get('location')!);
        expect(location.pathname).toBe('/open-in-browser');
        expect(location.searchParams.get('returnTo')).toBe(path);
      },
    );

    it.each([
      '/images/logo.webp',
      '/locales/ko.json',
      '/favicon/favicon.ico',
      '/concert2025/video/01.YOUNGPASSE.mp4',
      '/firebase-messaging-sw.js',
      '/_next/static/chunks/main.js',
    ])('정적 자산 %s 은 인앱 redirect 하지 않는다', async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      const res = await middleware(request(path, { 'user-agent': KAKAOTALK_UA }));
      expect(res.headers.get('location')).toBeNull();
    });

    it('인바운드 라우팅 헤더를 지우고 x-locale 을 주입한다', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      const res = await middleware(
        request('/ko/vote/295.json', { 'x-pathname': '/ko/vote/295', 'x-locale': 'ja' }),
      );
      const forwarded = forwardedRequestHeaders(res);
      expect(forwarded.get('x-locale')).toBe('ko');
      expect(forwarded.has('x-pathname')).toBe(false);
    });
  });

  describe('Supabase 설정 시', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    });

    it('비로그인 요청도 x-locale 을 주입한다', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const res = await middleware(request('/en/vote', { 'x-pathname': '/ko/vote' }));
      const forwarded = forwardedRequestHeaders(res);
      expect(forwarded.get('x-locale')).toBe('en');
      expect(forwarded.has('x-pathname')).toBe(false);
    });

    it('탈퇴 계정은 해당 언어 로그인 페이지로 redirect 한다', async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      maybeSingleMock.mockResolvedValue({ data: { deleted_at: '2026-09-01T00:00:00Z' } });
      const res = await middleware(request('/ja/vote'));
      expect(signOutMock).toHaveBeenCalled();
      const location = new URL(res.headers.get('location')!);
      expect(location.pathname).toBe('/ja/login');
      expect(location.searchParams.get('error')).toBe('withdrawn');
    });

    it('percent-encoded 로케일 경로의 탈퇴 redirect 도 그 언어로 보낸다', async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      maybeSingleMock.mockResolvedValue({ data: { deleted_at: '2026-09-01T00:00:00Z' } });
      const res = await middleware(request('/%6Aa/vote'));
      expect(new URL(res.headers.get('location')!).pathname).toBe('/ja/login');
    });

    it('확장자가 붙은 HTML 경로도 탈퇴 계정을 차단한다', async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      maybeSingleMock.mockResolvedValue({ data: { deleted_at: '2026-09-01T00:00:00Z' } });
      const res = await middleware(request('/ko/vote/295.json'));
      const location = new URL(res.headers.get('location')!);
      expect(location.pathname).toBe('/ko/login');
      expect(location.searchParams.get('error')).toBe('withdrawn');
    });

    it('로그인 페이지는 탈퇴 검사를 건너뛴다', async () => {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      const res = await middleware(request('/ja/login'));
      expect(maybeSingleMock).not.toHaveBeenCalled();
      expect(res.headers.get('location')).toBeNull();
      expect(forwardedRequestHeaders(res).get('x-locale')).toBe('ja');
    });
  });
});
