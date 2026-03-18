import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Mocks ---

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const mockUsePathname = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: mockRefresh,
    prefetch: vi.fn(),
  }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

const mockSetLanguage = vi.fn();
const mockStoreLoadTranslations = vi.fn().mockResolvedValue(undefined);
const mockStoreT = vi.fn((key: string) => `translated:${key}`);

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    setLanguage: mockSetLanguage,
    translations: {},
    loadTranslations: mockStoreLoadTranslations,
    t: mockStoreT,
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  })),
}));

vi.mock('@/config/settings', () => ({
  SUPPORTED_LANGUAGES: ['en', 'ko', 'ja', 'zh-cn', 'zh-tw', 'id', 'es', 'bn', 'tl', 'th', 'vi', 'my'] as const,
  DEFAULT_LANGUAGE: 'en',
}));

// --- Import after mocks ---

import { useLocaleRouter } from '@/hooks/useLocaleRouter';

describe('useLocaleRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/ko/votes');
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  describe('currentLocale', () => {
    it('should detect current locale from pathname', () => {
      mockUsePathname.mockReturnValue('/ko/votes');
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.currentLocale).toBe('ko');
    });

    it('should detect en locale', () => {
      mockUsePathname.mockReturnValue('/en/home');
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.currentLocale).toBe('en');
    });

    it('should handle legacy /zh as zh-cn', () => {
      mockUsePathname.mockReturnValue('/zh/page');
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.currentLocale).toBe('zh-cn');
    });

    it('should fallback to default for unknown locale', () => {
      mockUsePathname.mockReturnValue('/xx/page');
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.currentLocale).toBe('en');
    });
  });

  describe('isValidLocale', () => {
    it('should return true for supported locales', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.isValidLocale('ko')).toBe(true);
      expect(result.current.isValidLocale('en')).toBe(true);
      expect(result.current.isValidLocale('ja')).toBe(true);
    });

    it('should return false for unsupported locales', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.isValidLocale('fr')).toBe(false);
      expect(result.current.isValidLocale('de')).toBe(false);
      expect(result.current.isValidLocale('')).toBe(false);
    });
  });

  describe('extractLocaleFromPath', () => {
    it('should extract locale and path', () => {
      const { result } = renderHook(() => useLocaleRouter());
      const extracted = result.current.extractLocaleFromPath('/ko/votes/123');
      expect(extracted.locale).toBe('ko');
      expect(extracted.path).toBe('/votes/123');
    });

    it('should normalize zh to zh-cn', () => {
      const { result } = renderHook(() => useLocaleRouter());
      const extracted = result.current.extractLocaleFromPath('/zh/page');
      expect(extracted.locale).toBe('zh-cn');
      expect(extracted.path).toBe('/page');
    });

    it('should return default locale for paths without locale', () => {
      const { result } = renderHook(() => useLocaleRouter());
      const extracted = result.current.extractLocaleFromPath('/page/something');
      expect(extracted.locale).toBe('en');
      expect(extracted.path).toBe('/page/something');
    });
  });

  describe('removeLocaleFromPath', () => {
    it('should remove locale prefix', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.removeLocaleFromPath('/ko/votes')).toBe('/votes');
    });

    it('should return / for root locale path', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.removeLocaleFromPath('/ko')).toBe('/');
    });
  });

  describe('getLocalizedPath', () => {
    it('should add current locale prefix', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.getLocalizedPath('/votes')).toBe('/ko/votes');
    });

    it('should use specified locale', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.getLocalizedPath('/votes', 'ja')).toBe('/ja/votes');
    });

    it('should handle root path', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.getLocalizedPath('/', 'en')).toBe('/en');
    });

    it('should strip existing locale before adding new one', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.getLocalizedPath('/ko/votes', 'ja')).toBe('/ja/votes');
    });
  });

  describe('push', () => {
    it('should call router.push with localized path', () => {
      const { result } = renderHook(() => useLocaleRouter());
      result.current.push('/votes');
      expect(mockPush).toHaveBeenCalledWith('/ko/votes');
    });

    it('should use specified locale', () => {
      const { result } = renderHook(() => useLocaleRouter());
      result.current.push('/votes', 'ja');
      expect(mockPush).toHaveBeenCalledWith('/ja/votes');
    });
  });

  describe('replace', () => {
    it('should call router.replace with localized path', () => {
      const { result } = renderHook(() => useLocaleRouter());
      result.current.replace('/votes');
      expect(mockReplace).toHaveBeenCalledWith('/ko/votes');
    });
  });

  describe('refresh', () => {
    it('should call router.refresh', () => {
      const { result } = renderHook(() => useLocaleRouter());
      result.current.refresh();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('changeLocale', () => {
    it('should not change to same locale', async () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLocaleRouter());

      await act(async () => {
        await result.current.changeLocale('ko');
      });

      expect(mockSetLanguage).not.toHaveBeenCalled();
    });

    it('should not change to invalid locale', async () => {
      const { result } = renderHook(() => useLocaleRouter());

      await act(async () => {
        await result.current.changeLocale('fr' as any);
      });

      expect(mockSetLanguage).not.toHaveBeenCalled();
    });
  });

  describe('loadTranslations', () => {
    it('should return true on success', async () => {
      const { result } = renderHook(() => useLocaleRouter());
      let success: boolean = false;

      await act(async () => {
        success = await result.current.loadTranslations('ko');
      });

      expect(success).toBe(true);
    });

    it('should return false on error', async () => {
      mockStoreLoadTranslations.mockRejectedValueOnce(new Error('Load failed'));
      const { result } = renderHook(() => useLocaleRouter());
      let success: boolean = true;

      await act(async () => {
        success = await result.current.loadTranslations('ko');
      });

      expect(success).toBe(false);
    });
  });

  describe('t (translation)', () => {
    it('should delegate to store t function', () => {
      const { result } = renderHook(() => useLocaleRouter());
      const translated = result.current.t('some.key');
      expect(translated).toBe('translated:some.key');
    });

    it('should pass args to store t function', () => {
      const { result } = renderHook(() => useLocaleRouter());
      result.current.t('greeting', { name: 'John' });
      expect(mockStoreT).toHaveBeenCalledWith('greeting', { name: 'John' });
    });
  });

  describe('supportedLocales', () => {
    it('should contain expected locales', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.supportedLocales).toContain('en');
      expect(result.current.supportedLocales).toContain('ko');
      expect(result.current.supportedLocales).toContain('ja');
    });
  });

  describe('defaultLocale', () => {
    it('should be en', () => {
      const { result } = renderHook(() => useLocaleRouter());
      expect(result.current.defaultLocale).toBe('en');
    });
  });
});
