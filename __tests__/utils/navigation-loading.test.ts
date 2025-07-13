/**
 * navigation-loading.ts 유틸리티 함수 테스트
 */

import {
  isSamePage,
  isSamePageWithLocale,
  extractLocaleFromPath,
  removeLocaleFromPath,
  normalizePathWithLocale,
  hasSameLocale
} from '../../utils/navigation-loading';

// config/settings 모킹
jest.mock('@/config/settings', () => ({
  SUPPORTED_LANGUAGES: ['ko', 'en', 'ja', 'zh', 'id'],
  DEFAULT_LANGUAGE: 'ko',
}));

describe('navigation-loading utilities', () => {
  describe('isSamePage', () => {
    it('returns true for identical paths', () => {
      expect(isSamePage('/vote', '/vote')).toBe(true);
      expect(isSamePage('/ko/vote', '/ko/vote')).toBe(true);
    });

    it('returns false for different paths', () => {
      expect(isSamePage('/vote', '/mypage')).toBe(false);
      expect(isSamePage('/ko/vote', '/en/vote')).toBe(false);
    });
  });

  describe('extractLocaleFromPath', () => {
    it('extracts locale from localized paths', () => {
      expect(extractLocaleFromPath('/ko/vote')).toEqual({
        locale: 'ko',
        path: '/vote'
      });

      expect(extractLocaleFromPath('/en/mypage/profile')).toEqual({
        locale: 'en',
        path: '/mypage/profile'
      });

      expect(extractLocaleFromPath('/ja')).toEqual({
        locale: 'ja',
        path: '/'
      });
    });

    it('returns default locale for non-localized paths', () => {
      expect(extractLocaleFromPath('/vote')).toEqual({
        locale: 'ko',
        path: '/vote'
      });

      expect(extractLocaleFromPath('/')).toEqual({
        locale: 'ko',
        path: '/'
      });
    });

    it('returns default locale for unsupported languages', () => {
      expect(extractLocaleFromPath('/fr/vote')).toEqual({
        locale: 'ko',
        path: '/fr/vote'
      });

      expect(extractLocaleFromPath('/de/mypage')).toEqual({
        locale: 'ko',
        path: '/de/mypage'
      });
    });
  });

  describe('removeLocaleFromPath', () => {
    it('removes locale from localized paths', () => {
      expect(removeLocaleFromPath('/ko/vote')).toBe('/vote');
      expect(removeLocaleFromPath('/en/mypage/profile')).toBe('/mypage/profile');
      expect(removeLocaleFromPath('/ja')).toBe('/');
    });

    it('returns original path for non-localized paths', () => {
      expect(removeLocaleFromPath('/vote')).toBe('/vote');
      expect(removeLocaleFromPath('/')).toBe('/');
    });

    it('handles unsupported languages correctly', () => {
      expect(removeLocaleFromPath('/fr/vote')).toBe('/fr/vote');
      expect(removeLocaleFromPath('/de/mypage')).toBe('/de/mypage');
    });
  });

  describe('isSamePageWithLocale', () => {
    it('returns true for same pages with different locales', () => {
      expect(isSamePageWithLocale('/ko/vote', '/en/vote')).toBe(true);
      expect(isSamePageWithLocale('/ja/mypage/profile', '/zh/mypage/profile')).toBe(true);
    });

    it('returns true for same pages with same locales', () => {
      expect(isSamePageWithLocale('/ko/vote', '/ko/vote')).toBe(true);
      expect(isSamePageWithLocale('/en/mypage', '/en/mypage')).toBe(true);
    });

    it('returns false for different pages', () => {
      expect(isSamePageWithLocale('/ko/vote', '/ko/mypage')).toBe(false);
      expect(isSamePageWithLocale('/en/vote', '/ja/mypage')).toBe(false);
    });

    it('handles non-localized paths correctly', () => {
      expect(isSamePageWithLocale('/vote', '/ko/vote')).toBe(true);
      expect(isSamePageWithLocale('/mypage', '/en/mypage')).toBe(true);
      expect(isSamePageWithLocale('/vote', '/mypage')).toBe(false);
    });

    it('handles root paths correctly', () => {
      expect(isSamePageWithLocale('/ko', '/en')).toBe(true);
      expect(isSamePageWithLocale('/', '/ko')).toBe(true);
      expect(isSamePageWithLocale('/ko', '/ko/vote')).toBe(false);
    });
  });

  describe('normalizePathWithLocale', () => {
    it('normalizes paths with given locale', () => {
      expect(normalizePathWithLocale('/vote', 'ko')).toBe('/ko/vote');
      expect(normalizePathWithLocale('/mypage/profile', 'en')).toBe('/en/mypage/profile');
    });

    it('handles root path correctly', () => {
      expect(normalizePathWithLocale('/', 'ko')).toBe('/ko');
      expect(normalizePathWithLocale('/', 'en')).toBe('/en');
    });

    it('removes existing locale and applies new one', () => {
      expect(normalizePathWithLocale('/en/vote', 'ko')).toBe('/ko/vote');
      expect(normalizePathWithLocale('/ja/mypage', 'zh')).toBe('/zh/mypage');
    });

    it('handles already normalized paths', () => {
      expect(normalizePathWithLocale('/ko/vote', 'ko')).toBe('/ko/vote');
      expect(normalizePathWithLocale('/en/mypage', 'en')).toBe('/en/mypage');
    });
  });

  describe('hasSameLocale', () => {
    it('returns true for paths with same locale', () => {
      expect(hasSameLocale('/ko/vote', '/ko/mypage')).toBe(true);
      expect(hasSameLocale('/en/vote', '/en/mypage')).toBe(true);
    });

    it('returns false for paths with different locales', () => {
      expect(hasSameLocale('/ko/vote', '/en/vote')).toBe(false);
      expect(hasSameLocale('/ja/mypage', '/zh/mypage')).toBe(false);
    });

    it('handles non-localized paths correctly', () => {
      expect(hasSameLocale('/vote', '/mypage')).toBe(true); // both default to 'ko'
      expect(hasSameLocale('/vote', '/ko/mypage')).toBe(true); // both resolve to 'ko'
    });

    it('handles mixed localized and non-localized paths', () => {
      expect(hasSameLocale('/ko/vote', '/vote')).toBe(true); // both resolve to 'ko'
      expect(hasSameLocale('/en/vote', '/vote')).toBe(false); // 'en' vs 'ko'
    });
  });
}); 