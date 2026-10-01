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

class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
  }
}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundSignal();
  },
}));
vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'font-inter' }) }));
vi.mock('@/app/[lang]/ClientLayout', () => ({ default: () => null }));
vi.mock('@/components/client/ads/ConsentAwareAdsense', () => ({ default: () => null }));
vi.mock('@/components/client/ads/CookieConsentBanner', () => ({ default: () => null }));

import { createRequire } from 'module';
import path from 'path';
import LanguageLayout, { generateMetadata, generateStaticParams } from '@/app/[lang]/layout';
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

  // middleware 를 거치지 않는 요청(/_next/rewards, /sitemap-1.xml)의 마지막 방어선.
  // 표기 변형(ZH-TW)도 middleware 가 정규 주소로 보내므로 여기서는 404 다.
  it.each(['ZH-TW', 'xx', 'login', '_next', 'sitemap-1.xml', '"><script>'])(
    '정규 언어가 아닌 세그먼트 %s 는 notFound 다',
    async (lang) => {
      await expect(render(lang)).rejects.toBeInstanceOf(NotFoundSignal);
    },
  );

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

  // AdSense 계정 확인 메타는 루트 레이아웃 metadata 가 싣고 Next 가 other 를 병합한다(main 과 같은 구조).
  // [lang] 이 other 를 통째로 다시 선언해 루트 값을 가리지 않는지만 확인한다.
  it('[lang] 메타데이터의 other 는 루트가 싣는 AdSense 메타를 다른 값으로 덮지 않는다', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ lang: 'ko' }) });
    expect(metadata.other?.['google-adsense-account']).toBeUndefined();
  });
});

// 빌드 결과 검사(scripts/verify-rendering-modes.js)는 이 목록의 언어마다 프리렌더 경로가 있는지 확인한다.
describe('[lang] 레이아웃 — 사전 생성 언어', () => {
  it('generateStaticParams 의 언어가 scripts/rendering-modes.js 의 PREBUILT_LANGUAGES 와 같다', async () => {
    const require = createRequire(import.meta.url);
    const { PREBUILT_LANGUAGES } = require(path.join(process.cwd(), 'scripts/rendering-modes.js')) as {
      PREBUILT_LANGUAGES: string[];
    };
    const params = await generateStaticParams();
    expect(params.map((param) => param.lang).sort()).toEqual([...PREBUILT_LANGUAGES].sort());
  });
});
