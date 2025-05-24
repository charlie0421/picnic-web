/**
 * Strings API 유틸리티 테스트
 */

import { getLocalizedString, getLocalizedJson } from '../../../utils/api/strings';
import { useLanguageStore } from '../../../stores/languageStore';

// languageStore 모킹
jest.mock('../../../stores/languageStore', () => ({
  useLanguageStore: {
    getState: jest.fn(),
  },
}));

const mockUseLanguageStore = useLanguageStore as jest.Mocked<typeof useLanguageStore>;

describe('Strings API Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // console.error 모킹
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getLocalizedString', () => {
    it('returns empty string for null/undefined/falsy values', () => {
      expect(getLocalizedString(null)).toBe('');
      expect(getLocalizedString(undefined)).toBe('');
      expect(getLocalizedString('')).toBe('');
      expect(getLocalizedString(0)).toBe(''); // 0은 falsy 값이므로 빈 문자열 반환
      expect(getLocalizedString(false)).toBe('');
    });

    it('returns string value as-is', () => {
      expect(getLocalizedString('test string')).toBe('test string');
      expect(getLocalizedString('hello world')).toBe('hello world');
    });

    it('converts positive numbers to string', () => {
      expect(getLocalizedString(123)).toBe('123');
      expect(getLocalizedString(-456)).toBe('-456');
      expect(getLocalizedString(1)).toBe('1');
    });

    it('returns localized string for current language', () => {
      const localizedValue = {
        en: 'Hello',
        ko: '안녕하세요',
        ja: 'こんにちは',
      };

      expect(getLocalizedString(localizedValue, 'ko')).toBe('안녕하세요');
      expect(getLocalizedString(localizedValue, 'ja')).toBe('こんにちは');
      expect(getLocalizedString(localizedValue, 'en')).toBe('Hello');
    });

    it('falls back to English when current language is not available', () => {
      const localizedValue = {
        en: 'Hello',
        ko: '안녕하세요',
      };

      expect(getLocalizedString(localizedValue, 'fr')).toBe('Hello');
      expect(getLocalizedString(localizedValue, 'de')).toBe('Hello');
    });

    it('returns empty string when no English fallback exists', () => {
      const localizedValue = {
        ko: '안녕하세요',
        ja: 'こんにちは',
      };

      expect(getLocalizedString(localizedValue, 'fr')).toBe('');
    });

    it('uses language store when no currentLang provided (client-side)', () => {
      // window 객체가 존재하는 클라이언트 환경 시뮬레이션
      Object.defineProperty(window, 'window', {
        value: window,
        writable: true,
      });

      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: 'ko',
        setLanguage: jest.fn(),
      });

      const localizedValue = {
        en: 'Hello',
        ko: '안녕하세요',
      };

      expect(getLocalizedString(localizedValue)).toBe('안녕하세요');
    });

    it('uses English default on server-side', () => {
      // window 객체를 undefined로 설정하여 서버 환경 시뮬레이션
      const originalWindow = global.window;
      delete (global as any).window;

      const localizedValue = {
        en: 'Hello',
        ko: '안녕하세요',
      };

      expect(getLocalizedString(localizedValue)).toBe('Hello');

      // window 객체 복원
      global.window = originalWindow;
    });

    it('handles store errors gracefully', () => {
      mockUseLanguageStore.getState.mockImplementation(() => {
        throw new Error('Store error');
      });

      const localizedValue = {
        en: 'Hello',
        ko: '안녕하세요',
      };

      expect(getLocalizedString(localizedValue)).toBe('Hello');
      expect(console.error).toHaveBeenCalledWith('Error getting current language:', expect.any(Error));
    });

    it('uses default language when store returns null', () => {
      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: null,
        setLanguage: jest.fn(),
      });

      const localizedValue = {
        en: 'Hello',
        ko: '안녕하세요',
      };

      expect(getLocalizedString(localizedValue)).toBe('Hello');
    });
  });

  describe('getLocalizedJson', () => {
    it('returns null for null/undefined/falsy values', () => {
      expect(getLocalizedJson(null)).toBeNull();
      expect(getLocalizedJson(undefined)).toBeNull();
      expect(getLocalizedJson(0)).toBeNull(); // 0은 falsy 값이므로 null 반환
      expect(getLocalizedJson(false)).toBeNull();
    });

    it('returns string value as-is', () => {
      expect(getLocalizedJson('test string')).toBe('test string');
    });

    it('returns positive number value as-is', () => {
      expect(getLocalizedJson(123)).toBe(123);
      expect(getLocalizedJson(-456)).toBe(-456);
      expect(getLocalizedJson(1)).toBe(1);
    });

    it('returns localized JSON for current language', () => {
      const localizedValue = {
        en: { title: 'Hello', description: 'World' },
        ko: { title: '안녕하세요', description: '세계' },
      };

      expect(getLocalizedJson(localizedValue, 'ko')).toEqual({
        title: '안녕하세요',
        description: '세계',
      });
    });

    it('falls back to English when current language is not available', () => {
      const localizedValue = {
        en: { title: 'Hello' },
        ko: { title: '안녕하세요' },
      };

      expect(getLocalizedJson(localizedValue, 'fr')).toEqual({ title: 'Hello' });
    });

    it('returns null when no English fallback exists', () => {
      const localizedValue = {
        ko: { title: '안녕하세요' },
        ja: { title: 'こんにちは' },
      };

      expect(getLocalizedJson(localizedValue, 'fr')).toBeNull();
    });

    it('uses language store when no currentLang provided', () => {
      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: 'ko',
        setLanguage: jest.fn(),
      });

      const localizedValue = {
        en: { title: 'Hello' },
        ko: { title: '안녕하세요' },
      };

      expect(getLocalizedJson(localizedValue)).toEqual({ title: '안녕하세요' });
    });

    it('handles store errors gracefully', () => {
      mockUseLanguageStore.getState.mockImplementation(() => {
        throw new Error('Store error');
      });

      const localizedValue = {
        en: { title: 'Hello' },
        ko: { title: '안녕하세요' },
      };

      expect(getLocalizedJson(localizedValue)).toEqual({ title: 'Hello' });
      expect(console.error).toHaveBeenCalledWith('Error getting current language:', expect.any(Error));
    });
  });
});
