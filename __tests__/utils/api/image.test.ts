/**
 * Image API 유틸리티 테스트
 */

import { getCdnImageUrl } from '../../../utils/api/image';
import { useLanguageStore } from '../../../stores/languageStore';

// languageStore 모킹
jest.mock('../../../stores/languageStore', () => ({
  useLanguageStore: {
    getState: jest.fn(),
  },
}));

const mockUseLanguageStore = useLanguageStore as jest.Mocked<typeof useLanguageStore>;

describe('Image API Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // console.error 모킹
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
    
    // 기본 언어 스토어 모킹
    mockUseLanguageStore.getState.mockReturnValue({
      currentLanguage: 'en',
      setLanguage: jest.fn(),
      translations: {},
      isLoading: false,
      error: null,
      isTranslationLoaded: true,
      loadTranslations: jest.fn(),
      clearError: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getCdnImageUrl', () => {
    it('returns empty string for null/undefined paths', () => {
      expect(getCdnImageUrl(null)).toBe('');
      expect(getCdnImageUrl(undefined)).toBe('');
      expect(getCdnImageUrl('')).toBe('');
    });

    it('returns full URL as-is when path starts with http/https', () => {
      const httpUrl = 'http://example.com/image.jpg';
      const httpsUrl = 'https://example.com/image.jpg';
      
      expect(getCdnImageUrl(httpUrl)).toBe(httpUrl);
      expect(getCdnImageUrl(httpsUrl)).toBe(httpsUrl);
    });

    it('handles URLs with whitespace correctly', () => {
      // 뒤에 공백이 있는 URL은 trim 처리되어 반환됨
      const urlWithSpacesAfter = 'https://example.com/image.jpg  ';
      expect(getCdnImageUrl(urlWithSpacesAfter)).toBe('https://example.com/image.jpg');
      
      // 앞에 공백이 있는 URL은 http/https 체크에서 실패하여 일반 경로로 처리됨
      const urlWithSpacesBefore = '  https://example.com/image.jpg';
      expect(getCdnImageUrl(urlWithSpacesBefore)).toBe('https://cdn.example.com/https://example.com/image.jpg');
    });

    it('generates CDN URL for simple path', () => {
      const result = getCdnImageUrl('images/logo.png');
      expect(result).toBe('https://cdn.example.com/images/logo.png');
    });

    it('handles path with leading slash', () => {
      const result = getCdnImageUrl('/images/logo.png');
      expect(result).toBe('https://cdn.example.com/images/logo.png');
    });

    it('trims whitespace from paths', () => {
      const result = getCdnImageUrl('  images/logo.png  ');
      expect(result).toBe('https://cdn.example.com/images/logo.png');
    });

    it('adds width parameter when provided', () => {
      const result = getCdnImageUrl('images/logo.png', 300);
      expect(result).toBe('https://cdn.example.com/images/logo.png?w=300');
    });

    it('handles width parameter with leading slash path', () => {
      const result = getCdnImageUrl('/images/logo.png', 500);
      expect(result).toBe('https://cdn.example.com/images/logo.png?w=500');
    });

    it('processes JSON localized paths correctly', () => {
      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: 'ko',
        setLanguage: jest.fn(),
        translations: {},
        isLoading: false,
        error: null,
        isTranslationLoaded: true,
        loadTranslations: jest.fn(),
        clearError: jest.fn(),
      } as any);

      const jsonPath = '{"en": "images/logo-en.png", "ko": "images/logo-ko.png"}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-ko.png');
    });

    it('falls back to English when current language not available in JSON', () => {
      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: 'ja',
        setLanguage: jest.fn(),
        translations: {},
        isLoading: false,
        error: null,
        isTranslationLoaded: true,
        loadTranslations: jest.fn(),
        clearError: jest.fn(),
      } as any);

      const jsonPath = '{"en": "images/logo-en.png", "ko": "images/logo-ko.png"}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-en.png');
    });

    it('falls back to Korean when English not available in JSON', () => {
      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: 'ja',
        setLanguage: jest.fn(),
        translations: {},
        isLoading: false,
        error: null,
        isTranslationLoaded: true,
        loadTranslations: jest.fn(),
        clearError: jest.fn(),
      } as any);

      const jsonPath = '{"ko": "images/logo-ko.png", "zh": "images/logo-zh.png"}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-ko.png');
    });

    it('uses first available value when no preferred languages available', () => {
      mockUseLanguageStore.getState.mockReturnValue({
        currentLanguage: 'ja',
        setLanguage: jest.fn(),
        translations: {},
        isLoading: false,
        error: null,
        isTranslationLoaded: true,
        loadTranslations: jest.fn(),
        clearError: jest.fn(),
      } as any);

      const jsonPath = '{"zh": "images/logo-zh.png", "id": "images/logo-id.png"}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-zh.png');
    });

    it('handles JSON path with width parameter', () => {
      const jsonPath = '{"en": "images/logo-en.png", "ko": "images/logo-ko.png"}';
      const result = getCdnImageUrl(jsonPath, 400);
      expect(result).toBe('https://cdn.example.com/images/logo-en.png?w=400');
    });

    it('handles JSON path with leading slash', () => {
      const jsonPath = '{"en": "/images/logo-en.png", "ko": "/images/logo-ko.png"}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-en.png');
    });

    it('handles malformed JSON gracefully', () => {
      const malformedJson = '{"en": "images/logo-en.png", "ko":}';
      const result = getCdnImageUrl(malformedJson);
      
      // JSON 파싱 실패 시 원래 경로를 사용
      expect(result).toBe('https://cdn.example.com/{"en": "images/logo-en.png", "ko":}');
      expect(console.error).toHaveBeenCalledWith('이미지 경로 파싱 오류:', expect.any(Error));
    });

    it('uses English default on server-side', () => {
      // window 객체를 undefined로 설정하여 서버 환경 시뮬레이션
      const originalWindow = global.window;
      delete (global as any).window;

      const jsonPath = '{"en": "images/logo-en.png", "ko": "images/logo-ko.png"}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-en.png');

      // window 객체 복원
      global.window = originalWindow;
    });

    it('handles store access errors gracefully', () => {
      mockUseLanguageStore.getState.mockImplementation(() => {
        throw new Error('Store access error');
      });

      const jsonPath = '{"en": "images/logo-en.png", "ko": "images/logo-ko.png"}';
      const result = getCdnImageUrl(jsonPath);
      
      // 에러 발생 시 기본 언어(en) 사용
      expect(result).toBe('https://cdn.example.com/images/logo-en.png');
      expect(console.error).toHaveBeenCalledWith('언어 스토어 접근 오류:', expect.any(Error));
    });

    it('handles missing CDN URL environment variable', () => {
      delete process.env.NEXT_PUBLIC_CDN_URL;
      
      const result = getCdnImageUrl('images/logo.png');
      expect(result).toBe('/images/logo.png');
    });

    it('handles empty CDN URL environment variable', () => {
      process.env.NEXT_PUBLIC_CDN_URL = '';
      
      const result = getCdnImageUrl('images/logo.png');
      expect(result).toBe('/images/logo.png');
    });

    it('handles complex JSON with whitespace in paths', () => {
      const jsonPath = '{"en": "  images/logo-en.png  ", "ko": "  images/logo-ko.png  "}';
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('https://cdn.example.com/images/logo-en.png');
    });

    it('handles zero width parameter', () => {
      const result = getCdnImageUrl('images/logo.png', 0);
      expect(result).toBe('https://cdn.example.com/images/logo.png');
    });

    it('handles negative width parameter', () => {
      const result = getCdnImageUrl('images/logo.png', -100);
      expect(result).toBe('https://cdn.example.com/images/logo.png?w=-100');
    });
  });
});
