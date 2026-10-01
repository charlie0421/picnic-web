import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_CALLBACK_PATH,
  classifyFirstSegment,
  decideLocaleRoute,
  isPassThroughPath,
  normalizeLanguageTag,
  resolvePreferredLanguage,
  type LanguageSignals,
} from '@/lib/i18n/locale-routing';

const signals = (partial: Partial<LanguageSignals> = {}): LanguageSignals => ({
  referer: null,
  host: 'www.picnic.fan',
  cookieLocale: null,
  acceptLanguage: null,
  ...partial,
});

describe('normalizeLanguageTag', () => {
  it.each([
    ['KO', 'ko'],
    ['zh_TW', 'zh-tw'],
    ['ZH-Hant-TW', 'zh-tw'],
    ['zh-Hans-TW', 'zh-cn'],
    ['zh', 'zh-cn'],
    ['zh-HK', 'zh-tw'],
    ['zh-SG', 'zh-cn'],
    ['en-US', 'en'],
    ['es-419', 'es'],
    ['jp', 'ja'],
    ['fil-PH', 'tl'],
    [' ko ', 'ko'],
  ])('%s → %s', (tag, expected) => {
    expect(normalizeLanguageTag(tag)).toBe(expected);
  });

  it.each(['pt-BR', '', '   ', 'xx', 'api'])('%j → null', (tag) => {
    expect(normalizeLanguageTag(tag)).toBeNull();
  });

  it('null·undefined 는 null', () => {
    expect(normalizeLanguageTag(null)).toBeNull();
    expect(normalizeLanguageTag(undefined)).toBeNull();
  });
});

describe('classifyFirstSegment', () => {
  it.each(['en', 'zh-tw', 'my'])('%s 는 canonical', (raw) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'canonical', lang: raw });
  });

  it.each([
    ['KO', 'ko'],
    ['zh', 'zh-cn'],
    ['en-US', 'en'],
    ['fil', 'tl'],
    ['fil-PH', 'tl'],
    ['%6Bo', 'ko'],
    ['%7A%68-tw', 'zh-tw'],
    ['zh_TW', 'zh-tw'],
    ['jp', 'ja'],
  ])('%s 는 variant(%s)', (raw, lang) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'variant', lang });
  });

  it.each([
    'xx', 'fr', 'pt-BR', 'login', 'api', 'ads', 'faq', 'wp-admin', '.env', 'favicon.ico',
    'my-page', 'id-card', 'en-route', 'my_page', '',
  ])('%j 는 other', (raw) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'other' });
  });

  it('잘못된 percent-encoding 은 undecodable', () => {
    expect(classifyFirstSegment('%E0%A4%A')).toEqual({ kind: 'undecodable' });
  });
});

describe('resolvePreferredLanguage', () => {
  it('호스트가 같은 Referer 의 정규 언어가 쿠키보다 앞선다', () => {
    expect(
      resolvePreferredLanguage(
        signals({ referer: 'https://www.picnic.fan/th/vote', cookieLocale: 'ja', acceptLanguage: 'ko' }),
      ),
    ).toBe('th');
  });

  it.each([
    ['호스트가 다른 Referer', 'https://evil.example/th/vote'],
    ['정규 언어가 아닌 Referer', 'https://www.picnic.fan/KO/vote'],
    ['언어가 없는 Referer', 'https://www.picnic.fan/login'],
    ['해석할 수 없는 Referer', 'not a url'],
  ])('%s 는 무시하고 쿠키로 간다', (_label, referer) => {
    expect(resolvePreferredLanguage(signals({ referer, cookieLocale: 'ja' }))).toBe('ja');
  });

  it('Host 헤더가 없으면 Referer 를 쓰지 않는다', () => {
    expect(
      resolvePreferredLanguage(signals({ referer: 'https://www.picnic.fan/th/vote', host: null, cookieLocale: 'ja' })),
    ).toBe('ja');
  });

  it('쿠키가 Accept-Language 보다 앞선다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: 'ja', acceptLanguage: 'ko-KR' }))).toBe('ja');
  });

  it('지원하지 않는 쿠키 값은 무시한다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: 'xx', acceptLanguage: 'ko-KR' }))).toBe('ko');
  });

  it('Accept-Language 는 q 가 큰 순서, 같으면 적힌 순서로 본다', () => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'fr;q=0.9,ja;q=0.8,ko;q=0.95' }))).toBe('ko');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'th,vi' }))).toBe('th');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.8' }))).toBe('zh-tw');
  });

  it('q=0, *, 숫자가 아닌 q 의 태그는 버린다', () => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'th;q=abc,vi;q=0.3' }))).toBe('vi');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'ko;q=0,*;q=0.9,ja;q=0.1' }))).toBe('ja');
  });

  it('신호가 없으면 en', () => {
    expect(resolvePreferredLanguage(signals())).toBe('en');
  });

  // Review Focus 3: 깨진 헤더는 예외 없이 다음 신호로 넘어간다
  it.each([
    [';;;,,q='],
    [',,,,'],
    ['q=1'],
    [Array.from({ length: 500 }, (_, i) => `x${i};q=0.${i % 10}`).join(',')],
  ])('깨진 Accept-Language 는 en 으로 떨어진다', (acceptLanguage) => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage }))).toBe('en');
  });

  it('깨진 쿠키 값은 무시한다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: '%E0%A4%A', acceptLanguage: 'ko' }))).toBe('ko');
  });
});

describe('isPassThroughPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    '/auth/callback',
    '/auth/callback/',
    '/auth/callback/google',
    '/auth/loading',
    '/ads/shortform/player',
    '/open-in-browser',
    '/supabase-proxy',
    '/supabase-proxy/rest/v1',
    '/api/banners',
    '/_next/data/x.json',
    '/_next/static/chunks/main.js',
    '/_vercel/insights/script.js',
    '/images/logo.webp',
    '/locales/ko.json',
    '/favicon/favicon.ico',
    '/concert2025/image/logo.png',
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap-0.xml',
    '/sitemap-42.xml',
    '/manifest.json',
    '/firebase-messaging-sw.js',
  ])('%s 는 통과', (pathname) => {
    expect(isPassThroughPath(pathname)).toBe(true);
  });

  it.each([
    '/auth',
    '/auth/foo',
    '/auth/callback/a/b',
    '/ads',
    '/open-in-browser/x',
    '/api',
    '/sitemap-foo.xml',
    '/sitemap-00.xml',
    '/sitemap-123.xml',
    '/.well-known/x',
    '/favicon.ico/vote',
    '/concert2025',
    '/login',
  ])('%s 는 통과가 아니다', (pathname) => {
    expect(isPassThroughPath(pathname)).toBe(false);
  });

  it('/__nextjs 내부 경로는 개발 서버에서만 통과한다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isPassThroughPath('/__nextjs_foo')).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(isPassThroughPath('/__nextjs_foo')).toBe(false);
  });

  it('콜백 모양에 맞는 경로는 모두 통과 목록에 있다 (규칙 2 의 목적지가 통과로 끝나는 조건)', () => {
    for (const pathname of ['/auth/callback', '/auth/callback/', '/auth/callback/apple', '/auth/callback/apple/']) {
      expect(AUTH_CALLBACK_PATH.test(pathname)).toBe(true);
      expect(isPassThroughPath(pathname)).toBe(true);
    }
  });
});

describe('decideLocaleRoute', () => {
  const none = signals();

  it('규칙 1: / 는 통과', () => {
    expect(decideLocaleRoute('/', none)).toEqual({ type: 'pass', lang: null });
  });

  it.each([
    ['/ko/auth/callback/google', '/auth/callback/google'],
    ['/ko/auth/callback', '/auth/callback'],
    ['/zh-tw/auth/callback/apple/', '/auth/callback/apple/'],
  ])('규칙 2: %s 는 언어를 뗀 %s 로', (pathname, expected) => {
    expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'redirect', pathname: expected });
  });

  it.each([
    ['/ko/vote', 'ko'],
    ['/zh-tw/vote/295', 'zh-tw'],
    ['/ko', 'ko'],
    ['/ko/', 'ko'],
    ['/ko/authx', 'ko'],
    ['/ko/auth/callbackx', 'ko'],
    ['/ko/auth/callback/a/b', 'ko'],
    ['/ko//x', 'ko'],
  ])('규칙 3: %s 는 통과(lang=%s)', (pathname, lang) => {
    expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'pass', lang });
  });

  it('규칙 4: 디코드할 수 없는 첫 세그먼트는 통과', () => {
    expect(decideLocaleRoute('/%E0%A4%A/vote', none)).toEqual({ type: 'pass', lang: null });
  });

  it.each(['/auth/callback/google', '/open-in-browser', '/supabase-proxy/rest/v1', '/_vercel/insights/script.js'])(
    '규칙 5: %s 는 통과',
    (pathname) => {
      expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'pass', lang: null });
    },
  );

  it.each([
    ['/KO/vote', '/ko/vote'],
    ['/zh/vote', '/zh-cn/vote'],
    ['/zh_TW/rewards', '/zh-tw/rewards'],
    ['/en-US/faq', '/en/faq'],
    ['/jp/vote', '/ja/vote'],
    ['/%6Bo/vote', '/ko/vote'],
    ['/fil-PH/vote', '/tl/vote'],
    ['/KO', '/ko'],
    ['/KO/auth/callback/apple/a/b', '/ko/auth/callback/apple/a/b'],
  ])('규칙 6: 표기 변형 %s → %s', (pathname, expected) => {
    expect(decideLocaleRoute(pathname, signals({ cookieLocale: 'ja' }))).toEqual({
      type: 'redirect',
      pathname: expected,
    });
  });

  it.each([
    '/login', '/download', '/rewards/1', '/vote/295', '/vote', '/mypage', '/concert2025',
    '/xx/rewards', '/fr/vote', '/wp-admin', '/.env', '/auth', '/auth/foo', '/ads', '/open-in-browser/x',
    '/api', '/my-page', '/sitemap-foo.xml', '/.well-known/x', '/auth/callback/google/x', '/favicon.ico/vote',
  ])('규칙 7: %s 는 선호 언어를 붙인다', (pathname) => {
    expect(decideLocaleRoute(pathname, none)).toEqual({ type: 'redirect', pathname: `/en${pathname}` });
    expect(decideLocaleRoute(pathname, signals({ cookieLocale: 'ja' }))).toEqual({
      type: 'redirect',
      pathname: `/ja${pathname}`,
    });
  });

  // Review Focus 4: 출처를 속이려는 경로도 목적지는 /{정규 언어}/ 아래다
  it.each(['//evil.com/x', '/\\evil.com', '/%2F%2Fevil.com/x', '/%5Cevil.com'])(
    '목적지 %s 는 /en/ 으로 시작한다',
    (pathname) => {
      const decision = decideLocaleRoute(pathname, none);
      expect(decision.type).toBe('redirect');
      expect((decision as { pathname: string }).pathname.startsWith('/en/')).toBe(true);
    },
  );
});

describe('리다이렉트 연쇄', () => {
  // next.config.js redirects() 가운데 이 규칙과 만나는 것만 흉내 낸다
  const LANGUAGE_ROOT = /^\/(en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)$/;
  const nextConfigRedirect = (pathname: string): string | null => {
    if (pathname === '/') return '/en/vote';
    const root = pathname.match(LANGUAGE_ROOT);
    if (root) return `/${root[1]}/vote`;
    if (pathname === '/download.html') return '/download';
    if (pathname === '/privacy_en.html') return '/en/privacy';
    if (pathname === '/privacy_ko.html') return '/ko/privacy';
    if (pathname === '/community') return '/vote';
    return null;
  };

  const follow = (start: string): string[] => {
    const seen = [start];
    let current = start;
    for (let hop = 0; hop < 6; hop += 1) {
      const fromConfig = nextConfigRedirect(current);
      const decision = fromConfig === null ? decideLocaleRoute(current, signals()) : null;
      const next = fromConfig ?? (decision?.type === 'redirect' ? decision.pathname : null);
      if (next === null) return seen;
      if (seen.includes(next)) throw new Error(`loop: ${[...seen, next].join(' → ')}`);
      seen.push(next);
      current = next;
    }
    throw new Error(`too long: ${seen.join(' → ')}`);
  };

  it.each([
    '/', '/ko', '/KO', '/login', '/download', '/download.html', '/privacy_en.html', '/privacy_ko.html',
    '/community', '/vote', '/vote/295', '/mypage', '/concert2025', '/rewards/1', '/xx/rewards', '/fr/vote',
    '/KO/vote', '/zh/vote', '/zh_TW/rewards', '/%6Bo/vote', '/wp-admin', '/.env', '/api', '/auth', '/auth/foo',
    '/auth/callback', '/auth/callback/google', '/auth/callback/google/x', '/ko/auth/callback',
    '/ko/auth/callback/google', '/ko/auth/callback/a/b', '/KO/auth/callback/apple', '/KO/auth/callback/apple/a/b',
    '/open-in-browser', '/open-in-browser/x', '/supabase-proxy/x', '/ko/supabase-proxy/x', '/favicon.ico/vote',
    '/sitemap-1.xml/x', '/.well-known/x', '//evil.com/x', '/my-page',
  ])('%s 는 세 번 안에 끝나고 되돌아오지 않는다', (start) => {
    expect(follow(start).length - 1).toBeLessThanOrEqual(3);
  });

  it('/KO 는 두 번(/ko → /ko/vote), /auth/callback/google/x 는 한 번이다', () => {
    expect(follow('/KO')).toEqual(['/KO', '/ko', '/ko/vote']);
    expect(follow('/auth/callback/google/x')).toEqual(['/auth/callback/google/x', '/en/auth/callback/google/x']);
  });
});
