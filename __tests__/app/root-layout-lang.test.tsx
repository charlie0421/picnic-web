import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';

const requestHeaders = vi.fn<() => Headers>();

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders(),
}));

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter' }),
}));

vi.mock('@/components/client/ads/ConsentAwareAdsense', () => ({
  default: (props: Record<string, unknown>) => ({ type: 'ConsentAwareAdsense', props }),
}));

vi.mock('@/components/client/ads/CookieConsentBanner', () => ({
  default: () => null,
}));

import RootLayout from '@/app/layout';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';

type HtmlElement = ReactElement<{ lang: string; children: ReactElement[] }>;

const renderLayout = async (headers: Record<string, string>) => {
  requestHeaders.mockReturnValue(new Headers(headers));
  return (await RootLayout({ children: null })) as HtmlElement;
};

const findAdsense = (html: HtmlElement) => {
  const body = html.props.children.find((child) => child.type === 'body') as ReactElement<{
    children: ReactElement[];
  }>;
  return body.props.children.find((child) => child?.type === ConsentAwareAdsense) as
    | ReactElement<{ delayUntilIdle: boolean; idleTimeout: number }>
    | undefined;
};

/**
 * `<html lang>` 은 middleware 가 경로에서 검증해 넣은 `x-locale` 로 정한다.
 * 예전에는 아무도 만들지 않는 `x-pathname` 만 봐서 12개 언어가 전부 `ko` 였다.
 */
describe('RootLayout — <html lang>', () => {
  it.each([
    ['en', 'en'],
    ['ja', 'ja'],
    ['ko', 'ko'],
    ['zh-cn', 'zh-CN'],
    ['zh-tw', 'zh-TW'],
    ['tl', 'tl'],
  ])('x-locale=%s → lang="%s"', async (locale, expected) => {
    const html = await renderLayout({ 'x-locale': locale });
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe(expected);
  });

  it('x-locale 이 없으면 기존 판별(없으면 ko)을 유지한다', async () => {
    const html = await renderLayout({});
    expect(html.props.lang).toBe('ko');
  });

  it('지원하지 않는 x-locale 값은 무시한다', async () => {
    const html = await renderLayout({ 'x-locale': '"><script>' });
    expect(html.props.lang).toBe('ko');
  });
});

describe('RootLayout — 광고 분기는 x-locale 로 켜지지 않는다', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('x-locale 만 있을 때 vote 라우트 광고 지연은 비활성 그대로다', async () => {
    const html = await renderLayout({ 'x-locale': 'en' });
    const adsense = findAdsense(html);
    expect(adsense).toBeDefined();
    expect(adsense!.props.delayUntilIdle).toBe(false);
    expect(adsense!.props.idleTimeout).toBe(1200);
  });
});
