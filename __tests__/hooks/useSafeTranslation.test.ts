import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// --- Mocks ---

const mockOriginalT = vi.fn((key: string) => `translated:${key}`);
const mockUseLanguageStore = vi.fn();

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => mockUseLanguageStore(),
}));

const mockUseTranslationReady = vi.fn();
vi.mock('@/hooks/useTranslationReady', () => ({
  useTranslationReady: () => mockUseTranslationReady(),
}));

// --- Import after mocks ---

import { useSafeTranslation } from '@/hooks/useSafeTranslation';

describe('useSafeTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLanguageStore.mockReturnValue({
      t: mockOriginalT,
    });
    mockUseTranslationReady.mockReturnValue(true);
  });

  describe('when translations are ready', () => {
    it('should return isReady as true', () => {
      const { result } = renderHook(() => useSafeTranslation());
      expect(result.current.isReady).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('t should delegate to original translation function', () => {
      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.t('hello.world');
      expect(translated).toBe('translated:hello.world');
      expect(mockOriginalT).toHaveBeenCalledWith('hello.world', undefined);
    });

    it('t should pass args to original function', () => {
      const { result } = renderHook(() => useSafeTranslation());
      result.current.t('greeting', { name: 'John' });
      expect(mockOriginalT).toHaveBeenCalledWith('greeting', { name: 'John' });
    });

    it('tConditional should return translated value', () => {
      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.tConditional('hello.world');
      expect(translated).toBe('translated:hello.world');
    });

    it('tDebug should return translated value', () => {
      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.tDebug('hello.world');
      expect(translated).toBe('translated:hello.world');
    });
  });

  describe('when translations are NOT ready', () => {
    beforeEach(() => {
      mockUseTranslationReady.mockReturnValue(false);
    });

    it('should return isReady as false', () => {
      const { result } = renderHook(() => useSafeTranslation());
      expect(result.current.isReady).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it('t should return empty string by default', () => {
      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.t('hello.world');
      expect(translated).toBe('');
      expect(mockOriginalT).not.toHaveBeenCalled();
    });

    it('t should return custom fallback', () => {
      const { result } = renderHook(() =>
        useSafeTranslation({ fallback: 'Loading...' })
      );
      const translated = result.current.t('hello.world');
      expect(translated).toBe('Loading...');
    });

    it('t should return placeholder when showPlaceholder is true', () => {
      const { result } = renderHook(() =>
        useSafeTranslation({ showPlaceholder: true })
      );
      const translated = result.current.t('hello.world');
      expect(translated).toBe('...');
    });

    it('showPlaceholder should take priority over fallback', () => {
      const { result } = renderHook(() =>
        useSafeTranslation({ fallback: 'Fallback', showPlaceholder: true })
      );
      const translated = result.current.t('hello.world');
      expect(translated).toBe('...');
    });

    it('tConditional should return null', () => {
      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.tConditional('hello.world');
      expect(translated).toBeNull();
    });

    it('tDebug should return key in brackets in development', () => {
      const originalEnv = process.env.NODE_ENV;
      // @ts-ignore
      process.env.NODE_ENV = 'development';

      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.tDebug('hello.world');
      expect(translated).toBe('[hello.world]');

      // @ts-ignore
      process.env.NODE_ENV = originalEnv;
    });

    it('tDebug should return fallback in production', () => {
      const originalEnv = process.env.NODE_ENV;
      // @ts-ignore
      process.env.NODE_ENV = 'production';

      const { result } = renderHook(() =>
        useSafeTranslation({ fallback: 'prod-fallback' })
      );
      const translated = result.current.tDebug('hello.world');
      expect(translated).toBe('prod-fallback');

      // @ts-ignore
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('edge cases', () => {
    it('should handle empty key', () => {
      const { result } = renderHook(() => useSafeTranslation());
      const translated = result.current.t('');
      expect(mockOriginalT).toHaveBeenCalledWith('', undefined);
    });

    it('should handle undefined args', () => {
      const { result } = renderHook(() => useSafeTranslation());
      result.current.t('key', undefined);
      expect(mockOriginalT).toHaveBeenCalledWith('key', undefined);
    });

    it('should handle empty args object', () => {
      const { result } = renderHook(() => useSafeTranslation());
      result.current.t('key', {});
      expect(mockOriginalT).toHaveBeenCalledWith('key', {});
    });

    it('should not call original t when not ready even with fallback', () => {
      mockUseTranslationReady.mockReturnValue(false);
      const { result } = renderHook(() =>
        useSafeTranslation({ fallback: 'fb' })
      );
      result.current.t('key');
      expect(mockOriginalT).not.toHaveBeenCalled();
    });
  });
});
