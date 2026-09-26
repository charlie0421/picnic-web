import { describe, expect, it, vi } from 'vitest';

/**
 * DES-015: 공식 표기는 한국어 '피크닉', 그 외 언어 'Picnic'(결정 #4).
 * title 템플릿은 언어별로 만들고, 페이지 title 에는 브랜드를 중복해 넣지 않는다.
 */
vi.mock('@/app/[lang]/ClientLayout', () => ({ default: () => null }));
vi.mock('@/app/[lang]/VoteLiteClientLayout', () => ({ default: () => null }));
vi.mock('@/components/server', () => ({ BannerListFetcher: () => null, BannerSkeleton: () => null, VoteListSkeleton: () => null }));
vi.mock('@/components/server/vote/VoteListFetcher', () => ({ VoteListFetcher: () => null }));
vi.mock('@/utils/api/queries', () => ({ getBanners: vi.fn() }));
vi.mock('@/lib/data-fetching/server/supabase-service', () => ({ getCurrentUserContext: vi.fn() }));
vi.mock('@/lib/data-fetching/server/vote-service', () => ({ getVotes: vi.fn() }));
vi.mock('@/components/server/star-candy/StarCandyProductsFetcher', () => ({ default: () => null }));
// lib/i18n/server 는 React.cache 를 쓰는데 테스트의 React 18 에는 없다 — 실제 locale JSON 으로 대체
vi.mock('@/lib/i18n/server', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  return {
    getTranslations: async (lang: string) => {
      const dict = JSON.parse(readFileSync(join(process.cwd(), 'public/locales', `${lang}.json`), 'utf8'));
      return (key: string) => dict[key] ?? `[${key}]`;
    },
  };
});

import { brandName } from '@/app/[lang]/utils/metadata-utils';
import { generateMetadata as layoutMetadata } from '@/app/[lang]/layout';
import { generateMetadata as voteMetadata } from '@/app/[lang]/(main)/vote/page';
import { generateMetadata as starCandyMetadata } from '@/app/[lang]/(main)/star-candy/page';

const params = (lang: string) => ({ params: Promise.resolve({ lang }) });
const HANGUL = /[ㄱ-힝]/;

describe('brandName', () => {
  it.each([
    ['ko', '피크닉'],
    ['en', 'Picnic'],
    ['ja', 'Picnic'],
    ['xx', 'Picnic'],
  ])('%s → %s', (lang, brand) => expect(brandName(lang)).toBe(brand));
});

describe('[lang] layout title 템플릿', () => {
  it('한국어는 "%s | 피크닉"', async () => {
    const md = await layoutMetadata(params('ko'));
    expect(md.title).toEqual({ default: '피크닉', template: '%s | 피크닉' });
    expect((md.openGraph as { siteName?: string }).siteName).toBe('피크닉');
  });

  it('영어는 "%s | Picnic" 이고 기본 description 에 한국어가 없다', async () => {
    const md = await layoutMetadata(params('en'));
    expect(md.title).toEqual({ default: 'Picnic', template: '%s | Picnic' });
    expect(String(md.description)).not.toMatch(HANGUL);
    expect(md.applicationName).toBe('Picnic');
  });
});

describe('페이지 title 은 브랜드를 중복하지 않고 언어를 따른다', () => {
  it('영어 투표 목록은 영어 title·description, 12개 언어 hreflang', async () => {
    const md = await voteMetadata(params('en'));
    expect(md.title).toBe('Voting');
    expect(String(md.description)).not.toMatch(HANGUL);
    expect(Object.keys(md.alternates?.languages ?? {})).toHaveLength(13); // 12개 + x-default
  });

  it('한국어 투표 목록 title 은 "투표"', async () => {
    expect((await voteMetadata(params('ko'))).title).toBe('투표');
  });

  it.each(['ko', 'en'])('%s 별사탕 페이지 title 에 브랜드 접미사가 없다', async (lang) => {
    const md = await starCandyMetadata(params(lang));
    expect(String(md.title)).not.toMatch(/\|/);
  });
});
