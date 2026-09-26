import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getVoteByIdMock = vi.fn();

vi.mock('@/utils/api/queries', () => ({
  getVoteById: (...args: unknown[]) => getVoteByIdMock(...args),
}));

vi.mock('@/components/server/vote/VoteDetailFetcher', () => ({ default: () => null }));
vi.mock('@/components/server/VoteDetailSkeleton', () => ({ default: () => null }));
vi.mock('@/components/client/vote/common/VoteErrorFallback', () => ({
  VoteErrorFallback: () => null,
}));

import { generateMetadata } from '@/app/[lang]/(main)/vote/[id]/page';
import { DEFAULT_METADATA, buildLanguageAlternates } from '@/app/[lang]/utils/metadata-utils';

type OpenGraphLike = {
  title?: string;
  url?: string;
  locale?: string;
  images?: unknown;
};

const vote = (overrides: Record<string, unknown> = {}) => ({
  id: 295,
  title: { en: 'October Debut Vote', ko: '10월 데뷔 투표' },
  main_image: null,
  ...overrides,
});

const metadataFor = (lang: string, id = '295') =>
  generateMetadata({ params: Promise.resolve({ lang, id }) });

/**
 * 투표 상세(sitemap 기준 2,916 URL)가 자기 자신을 canonical 로 선언하고,
 * 공유 카드에 투표 제목·이미지가 나오도록 한다.
 */
describe('vote/[id] generateMetadata', () => {
  beforeEach(() => {
    getVoteByIdMock.mockReset();
    vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.picnic.fan/picnic');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('현재 언어의 투표 제목과 자기 자신 canonical·12개 언어 hreflang 을 낸다', async () => {
    getVoteByIdMock.mockResolvedValue(vote());
    const metadata = await metadataFor('en');

    expect(metadata.title).toBe('October Debut Vote');
    expect(metadata.alternates?.canonical).toBe('/en/vote/295');
    expect(metadata.alternates?.languages).toEqual(buildLanguageAlternates('/vote/295'));
  });

  it('og:title·og:url·og:locale 을 언어에 맞춘다', async () => {
    getVoteByIdMock.mockResolvedValue(vote());
    const metadata = await metadataFor('ko');
    const og = metadata.openGraph as OpenGraphLike;

    expect(metadata.title).toBe('10월 데뷔 투표');
    expect(og.title).toBe('10월 데뷔 투표');
    expect(og.url).toBe('/ko/vote/295');
    expect(og.locale).toBe('ko_KR');
    expect((metadata.twitter as { title?: string }).title).toBe('10월 데뷔 투표');
  });

  it('해당 언어 제목이 없으면 영어 제목으로 떨어진다', async () => {
    getVoteByIdMock.mockResolvedValue(vote());
    const metadata = await metadataFor('ja');
    expect(metadata.title).toBe('October Debut Vote');
    expect(metadata.alternates?.canonical).toBe('/ja/vote/295');
  });

  it('대표 이미지를 CDN 절대 URL 로 og:image·twitter:image 에 넣는다', async () => {
    getVoteByIdMock.mockResolvedValue(
      vote({ main_image: 'vote/bb5336ef-a39e-4bd9-8924-bd88ff3fe64e.png' }),
    );
    const metadata = await metadataFor('en');
    const imageUrl = 'https://cdn.picnic.fan/picnic/vote/bb5336ef-a39e-4bd9-8924-bd88ff3fe64e.png';

    expect((metadata.openGraph as OpenGraphLike).images).toEqual([
      { url: imageUrl, alt: 'October Debut Vote' },
    ]);
    expect((metadata.twitter as { images?: unknown }).images).toEqual([imageUrl]);
  });

  it.each([null, ''])('대표 이미지가 %j 이면 사이트 기본 OG 이미지를 쓴다', async (mainImage) => {
    getVoteByIdMock.mockResolvedValue(vote({ main_image: mainImage }));
    const metadata = await metadataFor('en');
    expect((metadata.openGraph as OpenGraphLike).images).toEqual(
      (DEFAULT_METADATA.openGraph as OpenGraphLike).images,
    );
  });

  it('본문과 같은 캐시 키(숫자 id)로 공유 getter(getVoteById)를 부른다', async () => {
    // 한 요청에서 실제로 한 번만 조회되는지는 vote-detail-single-query.test.ts 가 검증한다
    getVoteByIdMock.mockResolvedValue(vote());
    await metadataFor('en', '295');
    expect(getVoteByIdMock).toHaveBeenCalledWith(295);
  });

  it('숫자로 시작하는 id 는 페이지와 같은 규칙(parseInt)으로 정규화한 canonical 을 쓴다', async () => {
    getVoteByIdMock.mockResolvedValue(vote());
    const metadata = await metadataFor('en', '295abc');
    expect(getVoteByIdMock).toHaveBeenCalledWith(295);
    expect(metadata.alternates?.canonical).toBe('/en/vote/295');
  });

  it('지원하지 않는 언어는 기본 언어 경로를 canonical 로 쓴다', async () => {
    getVoteByIdMock.mockResolvedValue(vote());
    const metadata = await metadataFor('xx');
    expect(metadata.alternates?.canonical).toBe('/en/vote/295');
    expect((metadata.openGraph as OpenGraphLike).locale).toBe('en_US');
  });

  it('숫자가 아닌 id 는 조회하지 않고 레이아웃 기본값을 쓴다', async () => {
    const metadata = await metadataFor('en', 'abc');
    expect(getVoteByIdMock).not.toHaveBeenCalled();
    expect(metadata).toEqual({});
  });

  it('없는 투표는 레이아웃 기본값을 쓴다', async () => {
    getVoteByIdMock.mockResolvedValue(null);
    const metadata = await metadataFor('en', '999999');
    expect(metadata).toEqual({});
  });
});
