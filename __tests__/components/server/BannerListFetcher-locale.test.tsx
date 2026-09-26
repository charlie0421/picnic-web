import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Banner as DBBanner } from '@/types/interfaces';

const requestHeaders = vi.fn<() => Headers>();

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

const renderLinks = async (headers: Record<string, string>, links: string[]) => {
  requestHeaders.mockReturnValue(new Headers(headers));
  const element = (await BannerListFetcher({
    prefetchedBannersPromise: Promise.resolve(links.map(banner)),
  })) as ReactElement<{ banners: Array<{ link: string | null }> }>;
  return element.props.banners.map((b) => b.link);
};

/**
 * 배너 링크 언어는 middleware 가 넣는 `x-locale` 로 정한다.
 * 예전에는 아무도 만들지 않는 `x-pathname` 만 봐서 영어 사용자도 `/ko` 로 보냈다.
 */
describe('BannerListFetcher — 링크 언어', () => {
  it('x-locale 언어로 로케일 없는 링크를 보정한다', async () => {
    const links = await renderLinks({ 'x-locale': 'ja' }, [
      '/vote/210',
      'https://applink.picnic.fan/vote/detail/211',
    ]);
    expect(links).toEqual(['/ja/vote/210', 'https://www.picnic.fan/ja/vote/211']);
  });

  it('zh-tw 같은 지역 코드도 경로 표기 그대로 쓴다', async () => {
    const links = await renderLinks({ 'x-locale': 'zh-tw' }, ['/vote/210']);
    expect(links).toEqual(['/zh-tw/vote/210']);
  });

  it('x-locale 이 없으면 기존 판별(없으면 ko)을 유지한다', async () => {
    const links = await renderLinks({}, ['/vote/210']);
    expect(links).toEqual(['/ko/vote/210']);
  });

  it('지원하지 않는 x-locale 값은 무시한다', async () => {
    const links = await renderLinks({ 'x-locale': 'xx' }, ['/vote/210']);
    expect(links).toEqual(['/ko/vote/210']);
  });
});
