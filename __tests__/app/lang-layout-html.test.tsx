import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';

// 이 레이아웃이 요청 시점 API 를 부르면 모든 페이지가 다시 동적 렌더링이 된다.
vi.mock('next/headers', () => ({
  headers: () => {
    throw new Error('headers() must not be called in the [lang] layout');
  },
  cookies: () => {
    throw new Error('cookies() must not be called in the [lang] layout');
  },
}));

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'font-inter' }) }));
vi.mock('@/app/[lang]/ClientLayout', () => ({ default: () => null }));
vi.mock('@/components/client/ads/ConsentAwareAdsense', () => ({ default: () => null }));
vi.mock('@/components/client/ads/CookieConsentBanner', () => ({ default: () => null }));

import LanguageLayout, { generateMetadata } from '@/app/[lang]/layout';
import ClientLayout from '@/app/[lang]/ClientLayout';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';
import CookieConsentBanner from '@/components/client/ads/CookieConsentBanner';

type AnyElement = ReactElement<{ children?: unknown; [key: string]: unknown }>;

const flatten = (children: unknown): AnyElement[] =>
  (Array.isArray(children) ? children : [children]).filter(
    (child): child is AnyElement => typeof child === 'object' && child !== null && 'type' in child,
  );

const render = async (lang: string) =>
  (await LanguageLayout({ children: 'page', params: Promise.resolve({ lang }) })) as AnyElement;

const bodyOf = (html: AnyElement) => flatten(html.props.children).find((child) => child.type === 'body')!;

describe('[lang] 레이아웃 — <html lang>', () => {
  it.each([
    ['en', 'en'],
    ['ja', 'ja'],
    ['ko', 'ko'],
    ['zh-cn', 'zh-CN'],
    ['zh-tw', 'zh-TW'],
    ['tl', 'tl'],
    ['my', 'my'],
  ])('/%s → lang="%s"', async (lang, expected) => {
    const html = await render(lang);
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe(expected);
  });

  it('대소문자가 섞인 세그먼트는 정규화한다', async () => {
    expect((await render('ZH-TW')).props.lang).toBe('zh-TW');
  });

  it.each(['xx', 'login', '"><script>'])('지원하지 않는 세그먼트 %s 는 ko 로 폴백한다', async (lang) => {
    expect((await render(lang)).props.lang).toBe('ko');
  });

  it('body 안에서 ClientLayout 이 경로 언어를 받아 페이지를 감싼다', async () => {
    const body = bodyOf(await render('ja'));
    const wrapper = flatten(body.props.children).find((child) => child.type === 'div')!;
    const client = flatten(wrapper.props.children).find((child) => child.type === ClientLayout)!;
    expect(body.props.className).toBe('font-inter');
    expect(client.props.initialLanguage).toBe('ja');
    expect(client.props.children).toBe('page');
  });
});

describe('[lang] 레이아웃 — 광고', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const adsIn = async () => {
    const children = flatten(bodyOf(await render('en')).props.children);
    return {
      adsense: children.find((child) => child.type === ConsentAwareAdsense),
      banner: children.find((child) => child.type === CookieConsentBanner),
    };
  };

  describe('프로덕션', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('AdSense 를 지연 없이·1.2초 idle 로 싣고 쿠키 배너를 렌더한다', async () => {
      const { adsense, banner } = await adsIn();
      expect(adsense?.props).toMatchObject({
        clientId: 'ca-pub-1539304887624918',
        delayUntilIdle: false,
        idleTimeout: 1200,
      });
      expect(banner).toBeDefined();
    });
  });

  it('프로덕션이 아니면 광고와 배너를 렌더하지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { adsense, banner } = await adsIn();
    expect(adsense).toBeUndefined();
    expect(banner).toBeUndefined();
  });

  it('AdSense 계정 메타 태그는 [lang] 메타데이터가 싣는다', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: 'ko' }) });
    expect(metadata.other).toMatchObject({ 'google-adsense-account': 'ca-pub-1539304887624918' });
  });
});
