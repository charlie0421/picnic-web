import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/languageStore', () => ({ useLanguageStore: { getState: () => ({ currentLanguage: 'en' }) } }));

import { getCdnImageUrl } from '@/utils/api/image';

/** 명시한 언어가 있으면 store 언어(클라이언트)·기본값(서버)과 무관하게 같은 경로를 고른다 */
describe('getCdnImageUrl language', () => {
  const json = JSON.stringify({ en: 'en.jpg', ko: 'ko.jpg' });
  it('language 를 주면 그 언어 경로', () => {
    expect(getCdnImageUrl(json, 100, undefined, 'ko')).toContain('ko.jpg');
  });
  it('language 가 없으면 기존 동작(store/기본 en)', () => {
    expect(getCdnImageUrl(json, 100)).toContain('en.jpg');
  });
});
