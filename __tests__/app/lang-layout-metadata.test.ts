import { describe, it, expect, vi } from 'vitest';

vi.mock('@/app/[lang]/ClientLayout', () => ({ default: () => null }));
vi.mock('@/app/[lang]/VoteLiteClientLayout', () => ({ default: () => null }));

import { generateMetadata } from '@/app/[lang]/layout';

const metadataFor = (lang: string) => generateMetadata({ params: Promise.resolve({ lang }) });

/**
 * 언어 레이아웃 메타데이터는 metadata 를 따로 정하지 않은 모든 하위 페이지의 기본값이다.
 * canonical 이 홈(`/`·`/en`)으로 고정돼 있어 투표 상세 2,916 URL 이 전부 홈의 중복으로 선언됐다.
 */
describe('[lang] layout generateMetadata', () => {
  it.each(['ko', 'en', 'ja', 'zh-tw'])('%s: canonical 기본값은 현재 경로(./)다', async (lang) => {
    const metadata = await metadataFor(lang);
    expect(metadata.alternates?.canonical).toBe('./');
  });

  it('홈으로 향하던 2개짜리 hreflang 기본값을 내보내지 않는다', async () => {
    const metadata = await metadataFor('en');
    expect(metadata.alternates?.languages).toBeUndefined();
  });

  it.each([
    ['ko', 'ko_KR'],
    ['en', 'en_US'],
    ['ja', 'ja_JP'],
    ['zh-cn', 'zh_CN'],
    ['zh-tw', 'zh_TW'],
    ['th', 'th_TH'],
    ['xx', 'en_US'],
  ])('%s: og:locale=%s', async (lang, ogLocale) => {
    const metadata = await metadataFor(lang);
    expect((metadata.openGraph as { locale?: string }).locale).toBe(ogLocale);
  });

  it('og:url 은 현재 경로다', async () => {
    const metadata = await metadataFor('ja');
    expect((metadata.openGraph as { url?: string }).url).toBe('./');
  });

  it('manifest 는 /manifest.json 이다', async () => {
    const metadata = await metadataFor('ko');
    expect(metadata.manifest).toBe('/manifest.json');
  });
});
