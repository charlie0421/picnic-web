import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import { decideLocaleRoute } from '@/lib/i18n/locale-routing';

type Redirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

type NextConfig = {
  redirects: () => Promise<Redirect[]>;
  rewrites: () => Promise<Array<{ source: string; destination: string }>>;
  experimental?: { staticGenerationRetryCount?: number };
};

describe('next.config.js 진입 리다이렉트 계약', () => {
  it('언어 루트 정규식이 SUPPORTED_LANGUAGES 전체와 정확히 일치한다', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    const languageRootRedirects = redirects.filter(
      ({ source, destination }) => source.startsWith('/:lang(') && destination === '/:lang/vote',
    );

    expect(languageRootRedirects).toHaveLength(1);

    const match = languageRootRedirects[0].source.match(/^\/:lang\(([^)]+)\)$/);
    expect(match).not.toBeNull();
    expect(match?.[1].split('|')).toEqual([...SUPPORTED_LANGUAGES]);
  });

  // [lang] 밖의 페이지는 app/(bare)/ 아래에 둔다 — 루트 레이아웃이 pass-through 라 app/ 바로 아래의 페이지는
  // <html> 을 주는 레이아웃이 없다. 접두어 없는 리다이렉트 스텁도 (bare) 에 있다
  // (__tests__/app/unprefixed-redirect-stubs.test.tsx).
  it.each([
    'app/page.tsx',
    'app/vote/page.tsx',
    'app/vote/[id]/page.tsx',
    'app/mypage/page.tsx',
    'app/concert2025/page.tsx',
  ])('%s 는 app/ 바로 아래에 두지 않는다 (<html> 없는 페이지가 된다)', (file) => {
    expect(fs.existsSync(path.join(process.cwd(), file))).toBe(false);
  });

  it.each([
    ['/privacy_en.html', '/en/privacy'],
    ['/privacy_ko.html', '/ko/privacy'],
  ])('옛 개인정보 주소 %s 를 %s 로 보낸다', async (source, destination) => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    expect(redirects).toContainEqual({ source, destination, permanent: false });
  });

  it('영구 리다이렉트가 하나도 없다 (Instant Rollback 으로 완전히 되돌릴 수 있어야 한다)', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const redirects = await config.redirects();
    expect(redirects.filter((redirect) => redirect.permanent !== false)).toEqual([]);
  });

  it('언어가 붙은 supabase-proxy rewrite 는 정규 언어 12개만 받는다', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const rewrites = await config.rewrites();
    const localized = rewrites.filter(({ source }) => source.startsWith('/:lang') && source.includes('supabase-proxy'));

    expect(localized).toHaveLength(1);
    const match = localized[0].source.match(/^\/:lang\(([^)]+)\)\/supabase-proxy\/:path\*$/);
    expect(match).not.toBeNull();
    expect(match?.[1].split('|')).toEqual([...SUPPORTED_LANGUAGES]);
    expect(rewrites.map(({ source }) => source)).toContain('/supabase-proxy/:path*');
  });
});

/**
 * 2025-08 부터 PR #107 전까지 접두어 없는 한 세그먼트 주소는 /<세그먼트>/vote 로 리다이렉트됐다
 * (/download → /download/vote, /login?error=x → /login/vote). 그때 저장된 주소(북마크·방문 기록·공유된 링크)가
 * PR #107 뒤로는 /{언어}/download/vote 404 에 도착한다. 원래 페이지로 되돌린다.
 */
describe('next.config.js 과거 버그 주소 복구 (/<경로>/vote)', () => {
  const require = createRequire(import.meta.url);
  const { pathToRegexp, compile } = require('next/dist/compiled/path-to-regexp') as {
    pathToRegexp: (source: string, keys: Array<{ name: string | number }>, options: object) => RegExp;
    compile: (destination: string, options: object) => (params: Record<string, string>) => string;
  };
  const loadRedirects = () => (require(path.join(process.cwd(), 'next.config.js')) as NextConfig).redirects();

  // Next 가 설정 리다이렉트를 맞추는 방식 그대로다(next/dist/lib/build-custom-route.js): 위에서부터 처음 맞는 규칙을 쓴다.
  // next start 는 대소문자를 가리지 않고, Vercel 은 가린다(Production 의 /DOWNLOAD.HTML 은 /download 로 가지 않는다).
  const resolveConfigRedirect = async (pathname: string, sensitive = false): Promise<string | null> => {
    for (const { source, destination } of await loadRedirects()) {
      const keys: Array<{ name: string | number }> = [];
      const match = pathToRegexp(source, keys, { strict: true, sensitive, delimiter: '/' }).exec(pathname);
      if (!match) continue;
      const params = Object.fromEntries(keys.map((key, index) => [String(key.name), match[index + 1]]));
      return compile(destination, { validate: false })(params);
    }
    return null;
  };

  // 설정 리다이렉트가 middleware 보다 먼저다. 신호(쿠키·Accept-Language·Referer)가 없으면 선호 언어는 en 이다.
  const follow = async (start: string, sensitive = false): Promise<string[]> => {
    const seen = [start];
    let current = start;
    for (let hop = 0; hop < 4; hop += 1) {
      const fromConfig = await resolveConfigRedirect(current, sensitive);
      const decision =
        fromConfig === null
          ? decideLocaleRoute(current, { referer: null, host: 'www.picnic.fan', cookieLocale: null, acceptLanguage: null })
          : null;
      const next = fromConfig ?? (decision?.type === 'redirect' ? decision.pathname : null);
      if (next === null) return seen;
      if (seen.includes(next)) throw new Error(`loop: ${[...seen, next].join(' → ')}`);
      seen.push(next);
      current = next;
    }
    throw new Error(`too long: ${seen.join(' → ')}`);
  };

  it.each([
    ['/download/vote', '/download'],
    ['/login/vote', '/login'],
    ['/ko/download/vote', '/ko/download'],
    ['/zh-cn/download/vote', '/zh-cn/download'],
    ['/es/login/vote', '/es/login'],
  ])('%s 를 %s 로 보낸다', async (pathname, destination) => {
    expect(await resolveConfigRedirect(pathname)).toBe(destination);
  });

  it.each([
    // 목적지가 다시 걸리면 연쇄가 끝나지 않는다
    '/download',
    '/ko/download',
    '/login',
    '/ko/login',
    // 실제 투표 경로
    '/vote',
    '/ko/vote',
    '/ko/vote/295',
    '/api/vote',
    // 정규 언어가 아닌 접두어와 더 깊은 경로는 복구하지 않는다(middleware 가 404 로 보낸다)
    '/xx/download/vote',
    '/download/vote/1',
    '/ko/download/vote/1',
  ])('%s 는 건드리지 않는다', async (pathname) => {
    expect(await resolveConfigRedirect(pathname)).toBeNull();
  });

  it.each([
    ['/download/vote', ['/download/vote', '/download', '/en/download']],
    ['/login/vote', ['/login/vote', '/login', '/en/login']],
    ['/ko/download/vote', ['/ko/download/vote', '/ko/download']],
    ['/es/login/vote', ['/es/login/vote', '/es/login']],
  ])('%s 는 원래 페이지에서 끝난다', async (start, chain) => {
    expect(await follow(start)).toEqual(chain);
    expect(await follow(start, true)).toEqual(chain);
  });

  it('표기 변형 /KO/download/vote 는 next start 와 Vercel 에서 순서만 다르고 같은 곳에 도착한다', async () => {
    expect(await follow('/KO/download/vote')).toEqual(['/KO/download/vote', '/KO/download', '/ko/download']);
    expect(await follow('/KO/download/vote', true)).toEqual(['/KO/download/vote', '/ko/download/vote', '/ko/download']);
  });

  it('언어가 붙은 복구 규칙은 정규 언어 12개만 받는다', async () => {
    const localized = (await loadRedirects()).filter(({ source }) =>
      /^\/:lang\([^)]+\)\/(?:download|login)\/vote$/.test(source),
    );

    expect(localized).toHaveLength(2);
    for (const { source } of localized) {
      expect(source.match(/^\/:lang\(([^)]+)\)/)?.[1].split('|')).toEqual([...SUPPORTED_LANGUAGES]);
    }
  });
});

/**
 * rewards·faq·notice·download 는 빌드에서 프리렌더되고, 그 조회는 실패를 폴백으로 바꾸지 않고 예외로 전파한다
 * (폴백이 ISR 캐시에 저장되는 것을 막기 위해서다). 그래서 빌드 중 Supabase 조회가 한 번만 일시 실패해도
 * 프리렌더가 실패하고 Production 배포가 실패한다. Next 의 프리렌더 재시도를 켜서 일시 오류를 흡수한다.
 */
describe('next.config.js 빌드 안정성', () => {
  it('프리렌더가 실패하면 다시 시도한다', () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    expect(config.experimental?.staticGenerationRetryCount).toBeGreaterThanOrEqual(2);
  });

  // 조회가 페이지 생성 제한보다 오래 기다리면 Next 가 먼저 워커를 끊어 조회의 재시도·오류 보고가 돌지 않는다.
  it('빌드 중 조회 예산은 런타임 예산보다 길고 페이지 생성 제한보다 짧다', async () => {
    const require = createRequire(import.meta.url);
    const config = require(path.join(process.cwd(), 'next.config.js')) as NextConfig;
    const { BUILD_QUERY_TIMEOUT_MS, GET_REWARDS_TIMEOUT_MS } = await import('@/utils/api/queries-helpers');

    expect(config.staticPageGenerationTimeout).toBe(120);
    expect(BUILD_QUERY_TIMEOUT_MS).toBeGreaterThan(GET_REWARDS_TIMEOUT_MS);
    expect(BUILD_QUERY_TIMEOUT_MS).toBeLessThan((config.staticPageGenerationTimeout as number) * 1000);
  });
});
