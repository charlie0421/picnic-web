import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import {
  DEFAULT_METADATA,
  buildLanguageAlternates,
  createDynamicPathMetadata,
  createPageMetadata,
  getLanguageTag,
  getOpenGraphLocale,
  resolveCdnImageUrl,
} from '@/app/[lang]/utils/metadata-utils';

describe('buildLanguageAlternates — hreflang', () => {
  it('12개 지원 언어와 x-default 를 같은 경로로 연결한다', () => {
    expect(buildLanguageAlternates('/vote/295')).toEqual({
      en: '/en/vote/295',
      ko: '/ko/vote/295',
      'zh-CN': '/zh-cn/vote/295',
      'zh-TW': '/zh-tw/vote/295',
      ja: '/ja/vote/295',
      id: '/id/vote/295',
      es: '/es/vote/295',
      bn: '/bn/vote/295',
      tl: '/tl/vote/295',
      th: '/th/vote/295',
      vi: '/vi/vote/295',
      my: '/my/vote/295',
      'x-default': '/en/vote/295',
    });
  });

  it('지원 언어 수 + x-default 만큼의 항목을 만든다', () => {
    expect(Object.keys(buildLanguageAlternates('/vote'))).toHaveLength(
      SUPPORTED_LANGUAGES.length + 1,
    );
  });

  it('앞뒤 슬래시 유무와 관계없이 같은 경로를 만든다', () => {
    expect(buildLanguageAlternates('vote/')).toEqual(buildLanguageAlternates('/vote'));
  });

  it('루트 경로는 언어 루트로 연결한다', () => {
    const languages = buildLanguageAlternates('/');
    expect(languages.ko).toBe('/ko');
    expect(languages['x-default']).toBe('/en');
  });
});

describe('getLanguageTag', () => {
  it('지역 코드는 BCP 47 표기(지역 대문자)로 바꾼다', () => {
    expect(getLanguageTag('zh-cn')).toBe('zh-CN');
    expect(getLanguageTag('zh-tw')).toBe('zh-TW');
    expect(getLanguageTag('ko')).toBe('ko');
  });

  it('지원하지 않는 값은 null', () => {
    expect(getLanguageTag('xx')).toBeNull();
    expect(getLanguageTag(null)).toBeNull();
    expect(getLanguageTag('')).toBeNull();
  });
});

describe('getOpenGraphLocale — og:locale', () => {
  it('12개 언어 매핑이 전부 정확하다', () => {
    expect(Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l, getOpenGraphLocale(l)]))).toEqual({
      en: 'en_US',
      ko: 'ko_KR',
      'zh-cn': 'zh_CN',
      'zh-tw': 'zh_TW',
      ja: 'ja_JP',
      id: 'id_ID',
      es: 'es_ES',
      bn: 'bn_BD',
      tl: 'tl_PH',
      th: 'th_TH',
      vi: 'vi_VN',
      my: 'my_MM',
    });
  });

  it('모르는 언어는 기본 언어(en_US)로 떨어진다', () => {
    expect(getOpenGraphLocale('xx')).toBe('en_US');
  });
});

describe('DEFAULT_METADATA — SEO 위생', () => {
  it('canonical 기본값은 홈이 아니라 현재 경로다 (Next 가 ./ 를 요청 경로로 해석)', () => {
    expect(DEFAULT_METADATA.alternates?.canonical).toBe('./');
  });

  it('홈으로 향하던 ko/en 2개짜리 hreflang 기본값을 두지 않는다', () => {
    expect(DEFAULT_METADATA.alternates?.languages).toBeUndefined();
  });

  it('og:url 도 현재 경로다', () => {
    expect((DEFAULT_METADATA.openGraph as { url?: string }).url).toBe('./');
  });

  it('플레이스홀더 검증 메타를 내보내지 않는다', () => {
    expect(DEFAULT_METADATA.verification).toBeUndefined();
    expect(JSON.stringify(DEFAULT_METADATA)).not.toMatch(/YOUR_/);
  });

  it('404 나는 mask-icon 을 내보내지 않는다', () => {
    expect(JSON.stringify(DEFAULT_METADATA.icons)).not.toMatch(/mask-icon|safari-pinned-tab/);
  });

  it('manifest 는 /manifest.json 하나로 통일한다', () => {
    expect(DEFAULT_METADATA.manifest).toBe('/manifest.json');
    expect(createPageMetadata('투표', '설명').manifest).toBe('/manifest.json');
  });

  it('createPageMetadata 도 canonical 을 홈으로 두지 않는다', () => {
    expect(createPageMetadata('투표', '설명').alternates?.canonical).toBe('./');
  });
});

describe('createDynamicPathMetadata', () => {
  it('canonical 은 현재 언어 경로, hreflang 은 12개 언어 + x-default', () => {
    const metadata = createDynamicPathMetadata({ lang: 'ja' }, (l) => `/${l}/rewards/7`);
    expect(metadata.alternates?.canonical).toBe('/ja/rewards/7');
    expect(metadata.alternates?.languages).toEqual(buildLanguageAlternates('/rewards/7'));
  });

  it('지원하지 않는 언어의 canonical 은 기본 언어 경로다', () => {
    const metadata = createDynamicPathMetadata({ lang: 'xx' }, (l) => `/${l}/rewards/7`);
    expect(metadata.alternates?.canonical).toBe('/en/rewards/7');
  });
});

describe('resolveCdnImageUrl — OG 이미지 절대 URL', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.picnic.fan/picnic/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DB 상대 경로를 CDN 기준 URL 로 붙인다 (앞 슬래시 유무 무관, 변환 파라미터 없음)', () => {
    expect(resolveCdnImageUrl('vote/a.png')).toBe('https://cdn.picnic.fan/picnic/vote/a.png');
    expect(resolveCdnImageUrl('/reward/b.jpg')).toBe('https://cdn.picnic.fan/picnic/reward/b.jpg');
  });

  it('이미 절대 URL 이면 그대로 쓴다', () => {
    expect(resolveCdnImageUrl('https://img.example.com/c.png')).toBe('https://img.example.com/c.png');
  });

  it.each([null, undefined, '', '   '])('빈 값(%j)은 null', (value) => {
    expect(resolveCdnImageUrl(value)).toBeNull();
  });

  it('CDN 설정이 없으면 null', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_URL', '');
    expect(resolveCdnImageUrl('vote/a.png')).toBeNull();
  });
});
