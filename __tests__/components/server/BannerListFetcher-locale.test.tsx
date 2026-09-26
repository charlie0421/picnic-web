import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Banner as DBBanner } from '@/types/interfaces';

const requestHeaders = vi.fn<() => Headers>(() => {
  throw new Error('BannerListFetcher must not read request headers');
});

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders(),
}));

vi.mock('@/utils/api/queries', () => ({
  getBanners: vi.fn(),
}));

vi.mock('@/components/client/banner/BannerListPresenter', () => ({
  BannerListPresenter: () => null,
}));

import { BannerListFetcher } from '@/components/server/banner/BannerListFetcher';

const banner = (link: string) =>
  ({
    id: 1,
    celeb_id: null,
    created_at: '2026-09-01T00:00:00Z',
    deleted_at: null,
    duration: null,
    end_at: null,
    image: null,
    link,
    link_target_id: null,
    link_type: null,
    location: 'vote_home',
    order: 1,
    promotion_campaign_owned: false,
    start_at: null,
    thumbnail: null,
    title: { ko: '배너', en: 'Banner' },
    updated_at: '2026-09-01T00:00:00Z',
  }) as unknown as DBBanner;

const renderLinks = async (lang: string | undefined, links: string[]) => {
  const element = (await BannerListFetcher({
    prefetchedBannersPromise: Promise.resolve(links.map(banner)),
    lang,
  })) as ReactElement<{ banners: Array<{ link: string | null }> }>;
  return element.props.banners.map((b) => b.link);
};

/**
 * 배너 링크 언어는 페이지가 넘기는 `lang`(라우트 파라미터)으로 정한다.
 * 요청 헤더(headers())를 읽지 않아야 페이지를 동적 렌더로 끌어내리지 않는다.
 */
describe('BannerListFetcher — 링크 언어', () => {
  it('lang 으로 로케일 없는 링크를 보정한다', async () => {
    const links = await renderLinks('ja', [
      '/vote/210',
      'https://applink.picnic.fan/vote/detail/211',
    ]);
    expect(links).toEqual(['/ja/vote/210', 'https://www.picnic.fan/ja/vote/211']);
  });

  it('zh-tw 같은 지역 코드도 경로 표기 그대로 쓴다', async () => {
    const links = await renderLinks('zh-tw', ['/vote/210']);
    expect(links).toEqual(['/zh-tw/vote/210']);
  });

  it('lang 이 없으면 ko', async () => {
    const links = await renderLinks(undefined, ['/vote/210']);
    expect(links).toEqual(['/ko/vote/210']);
  });

  it('지원하지 않는 lang 은 ko', async () => {
    const links = await renderLinks('xx', ['/vote/210']);
    expect(links).toEqual(['/ko/vote/210']);
  });

  it('요청 헤더를 읽지 않는다', async () => {
    await renderLinks('en', ['/vote/210']);
    expect(requestHeaders).not.toHaveBeenCalled();
  });
});
