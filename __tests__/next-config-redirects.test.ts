import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

type Redirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

type NextConfig = {
  redirects: () => Promise<Redirect[]>;
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
