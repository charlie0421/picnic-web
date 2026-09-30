import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

type SitemapConfig = { exclude: string[] };

const loadConfig = () => {
  const require = createRequire(import.meta.url);
  return require(path.join(process.cwd(), 'next-sitemap.config.js')) as SitemapConfig;
};

// next-sitemap 이 exclude 를 적용할 때 쓰는 바로 그 함수로 검증한다(`*` 는 `/` 를 포함해 무엇이든 맞는다).
const applyExclude = async (routes: string[], exclude: string[]) => {
  const file = path.join(process.cwd(), 'node_modules/next-sitemap/dist/esm/utils/array.js');
  const { removeIfMatchPattern } = (await import(pathToFileURL(file).href)) as {
    removeIfMatchPattern: (input: string[], patterns: string[]) => string[];
  };
  return removeIfMatchPattern(routes, exclude);
};

/**
 * postbuild 의 next-sitemap 은 .next/prerender-manifest.json 의 프리렌더 경로를 전부 sitemap-0.xml 에 쓴다.
 * 루트 레이아웃이 headers() 를 부르지 않게 되면서 프리렌더 경로가 3개에서 수십 개로 늘었고, 그 안에는
 * 색인되면 안 되는 경로(인증 콜백 로딩, 광고 플레이어, 로그인, 리다이렉트만 하는 경로)가 있다.
 */
describe('next-sitemap 설정 — 프리렌더된 비콘텐츠 경로 제외', () => {
  const nonContent = [
    '/auth/loading',
    '/ads/shortform/player',
    '/vote',
    '/mypage',
    '/concert2025',
    ...SUPPORTED_LANGUAGES.map((lang) => `/${lang}`),
    ...SUPPORTED_LANGUAGES.map((lang) => `/${lang}/login`),
    ...SUPPORTED_LANGUAGES.map((lang) => `/${lang}/mypage/qna/new`),
  ];

  const content = [
    '/ko/rewards',
    '/en/faq',
    '/my/notice',
    '/ja/download',
    '/zh-cn/download',
    '/ko/concert2025',
  ];

  it('인증·광고·로그인·마이페이지·리다이렉트 경로는 sitemap 에 넣지 않는다', async () => {
    const kept = await applyExclude([...nonContent, ...content], loadConfig().exclude);
    expect(kept.filter((route) => nonContent.includes(route))).toEqual([]);
  });

  it('콘텐츠 페이지는 그대로 남긴다', async () => {
    const kept = await applyExclude([...nonContent, ...content], loadConfig().exclude);
    expect(kept).toEqual(content);
  });
});
