import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// --- Mocks ---

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: 'ko' }),
}));

vi.mock('@/utils/date', () => ({
  formatDateWithTimeZone: vi.fn((date: string, _tz: any, lang: string) => `${date}-${lang}`),
  formatRelativeTime: vi.fn((date: string, lang: string) => `relative-${date}-${lang}`),
  formatSmartDate: vi.fn((date: string, lang: string, ctx: string) => `smart-${date}-${lang}-${ctx}`),
}));

// --- Import after mocks ---

import { useLanguage } from '@/hooks/useLanguage';

describe('useLanguage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/ko/some/page');
  });

  describe('getCurrentLanguage', () => {
    it('should detect Korean from /ko path', () => {
      mockUsePathname.mockReturnValue('/ko/some/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('ko');
    });

    it('should detect English from /en path', () => {
      mockUsePathname.mockReturnValue('/en/some/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('en');
    });

    it('should detect Japanese from /ja path', () => {
      mockUsePathname.mockReturnValue('/ja/votes');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('ja');
    });

    it('should normalize /zh to zh-cn', () => {
      mockUsePathname.mockReturnValue('/zh/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('zh-cn');
    });

    it('should detect zh-cn directly', () => {
      mockUsePathname.mockReturnValue('/zh-cn/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('zh-cn');
    });

    it('should detect zh-tw', () => {
      mockUsePathname.mockReturnValue('/zh-tw/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('zh-tw');
    });

    it('should fallback to en for unsupported language', () => {
      mockUsePathname.mockReturnValue('/xx/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('en');
    });

    it('should fallback to en for empty path', () => {
      mockUsePathname.mockReturnValue('/');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('en');
    });

    it('should detect Indonesian', () => {
      mockUsePathname.mockReturnValue('/id/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('id');
    });

    it('should detect Spanish', () => {
      mockUsePathname.mockReturnValue('/es/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('es');
    });

    it('should detect Bengali', () => {
      mockUsePathname.mockReturnValue('/bn/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('bn');
    });

    it('should detect Tagalog', () => {
      mockUsePathname.mockReturnValue('/tl/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('tl');
    });

    it('should detect Thai', () => {
      mockUsePathname.mockReturnValue('/th/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('th');
    });

    it('should detect Vietnamese', () => {
      mockUsePathname.mockReturnValue('/vi/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('vi');
    });

    it('should detect Myanmar', () => {
      mockUsePathname.mockReturnValue('/my/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.currentLanguage).toBe('my');
    });
  });

  describe('formatDate', () => {
    it('should format a date string with the current language', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatDate('2024-01-15');
      expect(formatted).toBe('2024-01-15-ko');
    });
  });

  describe('formatRelativeDate', () => {
    it('should format relative date with current language', () => {
      mockUsePathname.mockReturnValue('/en/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatRelativeDate('2024-01-15');
      expect(formatted).toBe('relative-2024-01-15-en');
    });
  });

  describe('formatSmartDate', () => {
    it('should format smart date for post context by default', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatSmartDate('2024-01-15');
      expect(formatted).toBe('smart-2024-01-15-ko-post');
    });

    it('should format smart date for comment context', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatSmartDate('2024-01-15', 'comment');
      expect(formatted).toBe('smart-2024-01-15-ko-comment');
    });

    it('should format smart date for detailed context', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatSmartDate('2024-01-15', 'detailed');
      expect(formatted).toBe('smart-2024-01-15-ko-detailed');
    });
  });

  describe('formatPostDate', () => {
    it('should use post context', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatPostDate('2024-01-15');
      expect(formatted).toBe('smart-2024-01-15-ko-post');
    });
  });

  describe('formatCommentDate', () => {
    it('should use comment context', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const formatted = result.current.formatCommentDate('2024-01-15');
      expect(formatted).toBe('smart-2024-01-15-ko-comment');
    });
  });

  describe('getLocalizedText', () => {
    it('should return string as-is', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText('hello')).toBe('hello');
    });

    it('should return empty string for null', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText('')).toBe('');
    });

    it('should convert number to string', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText(42)).toBe('42');
    });

    it('should convert boolean to string', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText(true)).toBe('true');
    });

    it('should return first element of array', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText(['first', 'second'])).toBe('first');
    });

    it('should return empty string for empty array', () => {
      const { result } = renderHook(() => useLanguage());
      expect(result.current.getLocalizedText([])).toBe('');
    });

    it('should return localized text from object matching current language', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const text = { ko: '한국어', en: 'English', ja: '日本語' };
      expect(result.current.getLocalizedText(text)).toBe('한국어');
    });

    it('should fallback to en when current language is not available', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const text = { en: 'English', ja: '日本語' };
      expect(result.current.getLocalizedText(text)).toBe('English');
    });

    it('should fallback to ko when en is not available', () => {
      mockUsePathname.mockReturnValue('/ja/page');
      const { result } = renderHook(() => useLanguage());
      const text = { ko: '한국어' };
      expect(result.current.getLocalizedText(text)).toBe('한국어');
    });

    it('should return first available value when no matching language', () => {
      mockUsePathname.mockReturnValue('/ko/page');
      const { result } = renderHook(() => useLanguage());
      const text = { fr: 'French' };
      expect(result.current.getLocalizedText(text)).toBe('French');
    });

    it('should detect React elements and return placeholder', () => {
      const { result } = renderHook(() => useLanguage());
      const reactLike = { $$typeof: Symbol('react.element'), type: 'div', props: {} };
      expect(result.current.getLocalizedText(reactLike)).toBe('[React Element Detected]');
    });
  });
});
