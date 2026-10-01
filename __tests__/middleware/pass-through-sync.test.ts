import { execSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

import { config } from '@/middleware';
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import {
  AUTH_CALLBACK_PATH,
  classifyFirstSegment,
  decideLocaleRoute,
  isPassThroughPath,
} from '@/lib/i18n/locale-routing';

/**
 * 통과 목록과 matcher 는 손으로 적는 목록이다. 파일시스템과 어긋나면 실제 경로가 /{언어}/… 로 가서 404 가 된다.
 * 여기서 파일시스템을 읽어 대조한다. 새 public 파일·API route·(bare) 페이지를 추가했는데 이 테스트가 실패하면
 * middleware 의 matcher 와 lib/i18n/locale-routing.ts 의 통과 목록에 그 경로를 넣는다.
 */
const root = process.cwd();
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
const passes = (pathname: string) =>
  decideLocaleRoute(pathname, { referer: null, host: null, cookieLocale: null, acceptLanguage: null }).type === 'pass';

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

/** app 아래 파일 경로를 URL 로 바꾼다: 라우트 그룹 괄호를 벗기고 동적 세그먼트를 표본 값으로 채운다. */
const toUrl = (file: string, base: string, dynamicSample: (name: string) => string) =>
  '/' +
  path
    .relative(base, path.dirname(file))
    .split(path.sep)
    .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    .map((segment) => {
      const dynamic = segment.match(/^\[(?:\.\.\.)?(.+)\]$/);
      return dynamic ? dynamicSample(dynamic[1]) : segment;
    })
    .join('/');

const publicFiles = execSync('git ls-files public', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .map((file) => `/${file.slice('public/'.length)}`);

const CATCH_ALL_DIRECTORIES = ['api', 'images', 'locales', 'favicon', 'concert2025'];
const REDIRECT_STUBS = ['/vote', '/vote/x', '/mypage', '/concert2025'];

describe('통과 목록 ⇔ 파일시스템', () => {
  it('git 이 추적하는 public 파일이 있다', () => {
    expect(publicFiles.length).toBeGreaterThan(50);
    expect(publicFiles).toContain('/favicon.ico');
    expect(publicFiles).toContain('/apple-touch-icon.png');
    expect(publicFiles).toContain('/apple-touch-icon-precomposed.png');
  });

  it('public 의 모든 파일은 matcher 가 제외하고 통과 목록에 있다', () => {
    const notExcluded = publicFiles.filter((url) => matches(encodeURI(url)));
    const notPassing = publicFiles.filter((url) => !isPassThroughPath(url));
    expect(notExcluded).toEqual([]);
    expect(notPassing).toEqual([]);
  });

  it('app/api 의 모든 route 는 matcher 가 제외한다', () => {
    const apiRoutes = walk(path.join(root, 'app/api'))
      .filter((file) => path.basename(file) === 'route.ts')
      .map((file) => toUrl(file, path.join(root, 'app'), () => 'x'));
    expect(apiRoutes.length).toBeGreaterThan(20);
    expect(apiRoutes.filter((url) => matches(url))).toEqual([]);
  });

  it('(bare) 의 페이지는 통과 목록에 있거나 리다이렉트 스텁이다', () => {
    const barePages = walk(path.join(root, 'app/(bare)'))
      .filter((file) => path.basename(file) === 'page.tsx')
      .map((file) => toUrl(file, path.join(root, 'app'), (name) => (name === 'provider' ? 'google' : 'x')));
    expect(barePages.length).toBeGreaterThanOrEqual(8);
    const unexpected = barePages.filter((url) => !passes(url) && !REDIRECT_STUBS.includes(url));
    expect(unexpected).toEqual([]);
    // 스텁은 통과 목록에 없다 — middleware 가 먼저 선호 언어로 보낸다
    expect(REDIRECT_STUBS.filter((url) => passes(url))).toEqual([]);
  });

  it('app/ 바로 아래의 route handler 와 메타데이터 라우트가 통과한다', () => {
    expect(fs.existsSync(path.join(root, 'app/open-in-browser/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'app/sitemap.ts'))).toBe(true);
    expect(passes('/open-in-browser')).toBe(true);
    expect(matches('/sitemap.xml')).toBe(false);
    expect(isPassThroughPath('/sitemap.xml')).toBe(true);
  });

  it('next.config rewrites 의 source 가 통과한다', async () => {
    const require = createRequire(import.meta.url);
    const nextConfig = require(path.join(root, 'next.config.js')) as {
      rewrites: () => Promise<Array<{ source: string }>>;
    };
    const sources = (await nextConfig.rewrites()).map(({ source }) => source);
    expect(sources).toHaveLength(2);
    expect(passes('/supabase-proxy/x')).toBe(true);
    for (const lang of SUPPORTED_LANGUAGES) expect(passes(`/${lang}/supabase-proxy/x`)).toBe(true);
    expect(passes('/xx/supabase-proxy/x')).toBe(false);
  });

  it.each([
    '/api', '/apiary', '/favicon.ico/vote', '/sitemap-1.xml/x', '/sitemap-foo.xml', '/sitemap-00.xml',
    '/sitemap-123.xml', '/manifest.jsonx', '/favicon.icox', '/images', '/locales',
  ])('이름이 비슷한 없는 경로 %s 는 middleware 가 실행된다', (url) => {
    expect(matches(url)).toBe(true);
  });

  it('[lang] 아래 페이지의 첫 세그먼트는 언어로 오인되지 않는다', () => {
    const firstSegments = new Set(
      walk(path.join(root, 'app/[lang]'))
        .filter((file) => path.basename(file) === 'page.tsx')
        .map((file) => toUrl(file, path.join(root, 'app/[lang]'), () => 'x').split('/')[1])
        .filter(Boolean),
    );
    expect(firstSegments.size).toBeGreaterThan(8);
    const misread = [...firstSegments].filter((segment) => classifyFirstSegment(segment).kind !== 'other');
    expect(misread).toEqual([]);
  });

  it('콜백 모양에 맞는 경로는 모두 통과 목록에 있다', () => {
    for (const pathname of ['/auth/callback', '/auth/callback/', '/auth/callback/google', '/auth/callback/google/']) {
      expect(AUTH_CALLBACK_PATH.test(pathname)).toBe(true);
      expect(isPassThroughPath(pathname)).toBe(true);
    }
  });

  it('matcher 가 제외하는 디렉터리마다 catch-all handler 가 있고, 그 밖의 catch-all handler 는 없다', () => {
    for (const directory of CATCH_ALL_DIRECTORIES) {
      expect(fs.existsSync(path.join(root, 'app', directory, '[...slug]', 'route.ts'))).toBe(true);
    }
    const topLevelCatchAlls = fs
      .readdirSync(path.join(root, 'app'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(root, 'app', entry.name, '[...slug]', 'route.ts')))
      .map((entry) => entry.name)
      .sort();
    expect(topLevelCatchAlls).toEqual([...CATCH_ALL_DIRECTORIES].sort());

    // 각 디렉터리 아래의 없는 경로는 middleware 를 건너뛴다(그래서 handler 가 받는다)
    for (const url of ['/api/rewards', '/images/rewards/1', '/locales/faq', '/favicon/notice/1', '/concert2025/image/x.png']) {
      expect(matches(url)).toBe(false);
    }
  });
});
