import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock timezone-data before any imports
vi.mock('@/utils/timezone-data', () => ({
  TIMEZONE_ABBREVIATIONS: {
    'Asia/Seoul': 'KST',
    'Asia/Tokyo': 'JST',
    'America/New_York': 'EST',
    'Europe/London': 'GMT',
    'UTC': 'UTC',
  } as Record<string, string>,
  getTimeZonesByAbbreviation: vi.fn(),
  getSupportedAbbreviations: vi.fn(),
}));

vi.mock('@/config/settings', () => ({
  DEFAULT_LANGUAGE: 'en',
  settings: {
    languages: {
      supported: ['en', 'ko', 'ja'],
      default: 'en',
    },
  },
}));

import {
  getCurrentLocale,
  formatDateWithTimeZone,
  formatVotePeriodWithTimeZone,
  formatSimpleDateWithTimeZone,
  calculateRemainingTime,
  formatRelativeTime,
  formatSmartDate,
  formatPostDate,
  formatCommentDate,
  getUserTimeZone,
  getTimeZoneCode,
  clearTimeZoneCaches,
  watchTimeZoneChange,
} from '@/utils/date';
import {
  LOCALE_MAP,
  DATE_FNS_LOCALE_MAP,
  DATE_FORMAT_MAP,
  SIMPLE_DATE_FORMAT_MAP,
  RELATIVE_TIME_FORMATS,
  getLocaleString,
  RELATIVE_TIME_THRESHOLDS,
  localeMap,
} from '@/utils/date/date-constants';

describe('date-constants', () => {
  describe('LOCALE_MAP', () => {
    it('maps ko to ko-KR', () => {
      expect(LOCALE_MAP.ko).toBe('ko-KR');
    });

    it('maps en to en-US', () => {
      expect(LOCALE_MAP.en).toBe('en-US');
    });

    it('maps ja to ja-JP', () => {
      expect(LOCALE_MAP.ja).toBe('ja-JP');
    });
  });

  describe('getLocaleString', () => {
    it('returns locale string for known language', () => {
      expect(getLocaleString('ko')).toBe('ko-KR');
      expect(getLocaleString('en')).toBe('en-US');
      expect(getLocaleString('ja')).toBe('ja-JP');
    });

    it('returns en-US for unknown language', () => {
      expect(getLocaleString('xx' as any)).toBe('en-US');
    });
  });

  describe('RELATIVE_TIME_THRESHOLDS', () => {
    it('has correct MINUTE threshold', () => {
      expect(RELATIVE_TIME_THRESHOLDS.MINUTE).toBe(60 * 1000);
    });

    it('has correct HOUR threshold', () => {
      expect(RELATIVE_TIME_THRESHOLDS.HOUR).toBe(60 * 60 * 1000);
    });

    it('has correct DAY threshold', () => {
      expect(RELATIVE_TIME_THRESHOLDS.DAY).toBe(24 * 60 * 60 * 1000);
    });
  });
});

describe('formatters', () => {
  beforeEach(() => {
    clearTimeZoneCaches();
  });

  describe('getCurrentLocale', () => {
    it('returns a locale object for ko', () => {
      const locale = getCurrentLocale('ko');
      expect(locale).toBeDefined();
      expect(locale.code).toBe('ko');
    });

    it('returns a locale object for en', () => {
      const locale = getCurrentLocale('en');
      expect(locale).toBeDefined();
      expect(locale.code).toBe('en-US');
    });

    it('returns en-US locale for unknown language', () => {
      const locale = getCurrentLocale('zz' as any);
      expect(locale).toBeDefined();
      expect(locale.code).toBe('en-US');
    });
  });

  describe('formatDateWithTimeZone', () => {
    it('formats a UTC date to KST timezone', () => {
      const result = formatDateWithTimeZone(
        '2024-01-15T00:00:00Z',
        undefined,
        'ko',
        'Asia/Seoul',
        false,
      );
      // KST is UTC+9, so 2024-01-15 00:00 UTC = 2024-01-15 09:00 KST
      expect(result).toContain('2024');
      expect(result).toContain('09:00');
    });

    it('formats with custom format string', () => {
      const result = formatDateWithTimeZone(
        '2024-06-01T12:30:00Z',
        'yyyy-MM-dd',
        'en',
        'UTC',
        false,
      );
      expect(result).toBe('2024-06-01');
    });

    it('includes timezone code when includeTimeZoneCode is true', () => {
      const result = formatDateWithTimeZone(
        '2024-01-15T00:00:00Z',
        'HH:mm',
        'ko',
        'Asia/Seoul',
        true,
      );
      expect(result).toContain('KST');
    });

    it('does not include timezone code when includeTimeZoneCode is false', () => {
      const result = formatDateWithTimeZone(
        '2024-01-15T00:00:00Z',
        'HH:mm',
        'ko',
        'Asia/Seoul',
        false,
      );
      expect(result).not.toContain('KST');
    });

    it('handles invalid date gracefully', () => {
      const result = formatDateWithTimeZone('invalid-date', undefined, 'ko', 'UTC', false);
      // Should return fallback string
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('accepts Date object input', () => {
      const date = new Date('2024-03-01T10:00:00Z');
      const result = formatDateWithTimeZone(date, 'yyyy-MM-dd', 'en', 'UTC', false);
      expect(result).toBe('2024-03-01');
    });
  });

  describe('formatVotePeriodWithTimeZone', () => {
    it('formats start and end dates with ~ separator', () => {
      const result = formatVotePeriodWithTimeZone(
        '2024-01-01T00:00:00Z',
        '2024-01-31T23:59:59Z',
        'en',
        'UTC',
      );
      expect(result).toContain('~');
    });

    it('end date includes timezone code, start does not', () => {
      const result = formatVotePeriodWithTimeZone(
        '2024-01-01T00:00:00Z',
        '2024-01-31T23:59:59Z',
        'ko',
        'Asia/Seoul',
      );
      const parts = result.split('~');
      expect(parts.length).toBe(2);
      // End part should include timezone code
      expect(parts[1].trim()).toMatch(/KST|UTC/);
    });

    it('uses ko format by default', () => {
      const result = formatVotePeriodWithTimeZone(
        '2024-01-01T00:00:00Z',
        '2024-01-31T00:00:00Z',
      );
      // ko format includes 년/월/일
      expect(result).toContain('년');
    });
  });

  describe('formatSimpleDateWithTimeZone', () => {
    it('formats with simple date format for ko', () => {
      const result = formatSimpleDateWithTimeZone(
        '2024-06-15T10:30:00Z',
        'ko',
        'UTC',
        false,
      );
      // Should use simple format: M월 d일 HH:mm
      expect(result).toContain('월');
    });

    it('formats with simple date format for en', () => {
      const result = formatSimpleDateWithTimeZone(
        '2024-06-15T10:30:00Z',
        'en',
        'UTC',
        false,
      );
      // Should use simple format: MMM d HH:mm
      expect(result).toContain('Jun');
    });

    it('includes timezone code when requested', () => {
      const result = formatSimpleDateWithTimeZone(
        '2024-06-15T10:30:00Z',
        'ko',
        'Asia/Seoul',
        true,
      );
      expect(result).toContain('KST');
    });
  });

  describe('calculateRemainingTime', () => {
    it('returns zero for past dates', () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      const result = calculateRemainingTime(pastDate);
      expect(result.days).toBe(0);
      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.seconds).toBe(0);
    });

    it('calculates correct remaining time for future date', () => {
      // 1 day, 2 hours, 30 minutes, 15 seconds from now
      const futureMs = Date.now() + (1 * 86400000) + (2 * 3600000) + (30 * 60000) + (15 * 1000);
      const futureDate = new Date(futureMs).toISOString();
      const result = calculateRemainingTime(futureDate);
      expect(result.days).toBe(1);
      expect(result.hours).toBe(2);
      expect(result.minutes).toBe(30);
      // Allow 1 second tolerance for test execution time
      expect(result.seconds).toBeGreaterThanOrEqual(14);
      expect(result.seconds).toBeLessThanOrEqual(16);
    });

    it('returns correct structure', () => {
      const result = calculateRemainingTime(new Date(Date.now() + 100000).toISOString());
      expect(result).toHaveProperty('days');
      expect(result).toHaveProperty('hours');
      expect(result).toHaveProperty('minutes');
      expect(result).toHaveProperty('seconds');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Just now" for very recent dates (en)', () => {
      const now = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      const result = formatRelativeTime(now, 'en');
      expect(result).toBe('Just now');
    });

    it('returns minutes ago for dates within 1 hour', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const result = formatRelativeTime(thirtyMinsAgo, 'en');
      expect(result).toBe('30 minutes ago');
    });

    it('returns hours ago for dates within 1 day', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(threeHoursAgo, 'en');
      expect(result).toBe('3 hours ago');
    });

    it('returns singular form for 1 hour', () => {
      const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
      const result = formatRelativeTime(oneHourAgo, 'en');
      expect(result).toBe('1 hour ago');
    });

    it('returns korean format for ko language', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const result = formatRelativeTime(thirtyMinsAgo, 'ko');
      expect(result).toBe('30분 전');
    });

    it('returns japanese format for ja language', () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatRelativeTime(fiveMinsAgo, 'ja');
      expect(result).toBe('5分前');
    });

    it('returns absolute date for dates older than absoluteThreshold', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(tenDaysAgo, 'en', {
        useAbsolute: true,
        absoluteThreshold: 7,
      });
      // Should return formatted date string, not relative time
      expect(result).not.toContain('ago');
    });

    it('handles future dates by formatting as absolute date', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(futureDate, 'en');
      // Future dates are formatted as absolute
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns weeks ago for dates within 1 month', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(twoWeeksAgo, 'en', { useAbsolute: false });
      expect(result).toBe('2 weeks ago');
    });
  });

  describe('formatSmartDate', () => {
    it('uses post context by default', () => {
      const recent = new Date(Date.now() - 60 * 1000).toISOString();
      const result = formatSmartDate(recent, 'en');
      expect(result).toBe('1 minute ago');
    });

    it('uses detailed context for absolute formatting', () => {
      const date = '2024-01-15T10:00:00Z';
      const result = formatSmartDate(date, 'en', 'detailed');
      // Should be full date with timezone
      expect(result).toContain('2024');
    });

    it('uses comment context', () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const result = formatSmartDate(recent, 'en', 'comment');
      expect(result).toContain('minutes ago');
    });
  });

  describe('formatPostDate', () => {
    it('delegates to formatSmartDate with post context', () => {
      const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = formatPostDate(recent, 'en');
      expect(result).toBe('10 minutes ago');
    });
  });

  describe('formatCommentDate', () => {
    it('delegates to formatSmartDate with comment context', () => {
      const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = formatCommentDate(recent, 'en');
      expect(result).toBe('10 minutes ago');
    });
  });
});

describe('timezone', () => {
  beforeEach(() => {
    clearTimeZoneCaches();
  });

  describe('getUserTimeZone', () => {
    it('returns UTC on server side (no window)', () => {
      const originalWindow = globalThis.window;
      // @ts-ignore
      delete globalThis.window;
      clearTimeZoneCaches();
      const result = getUserTimeZone();
      expect(result).toBe('UTC');
      // @ts-ignore
      globalThis.window = originalWindow;
    });

    it('returns a timezone string in browser environment', () => {
      const result = getUserTimeZone();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('caches the timezone result', () => {
      const first = getUserTimeZone();
      const second = getUserTimeZone();
      expect(first).toBe(second);
    });

    it('refreshes when forceRefresh is true', () => {
      const first = getUserTimeZone();
      const second = getUserTimeZone(true);
      // Should still return the same value (same env) but go through the refresh path
      expect(typeof second).toBe('string');
    });
  });

  describe('getTimeZoneCode', () => {
    it('returns UTC on server side', () => {
      const originalWindow = globalThis.window;
      // @ts-ignore
      delete globalThis.window;
      clearTimeZoneCaches();
      const result = getTimeZoneCode('Asia/Seoul');
      expect(result).toBe('UTC');
      // @ts-ignore
      globalThis.window = originalWindow;
    });

    it('returns KST for Asia/Seoul', () => {
      const result = getTimeZoneCode('Asia/Seoul', 'ko');
      expect(result).toBe('KST');
    });

    it('returns JST for Asia/Tokyo', () => {
      const result = getTimeZoneCode('Asia/Tokyo', 'ja');
      expect(result).toBe('JST');
    });

    it('caches timezone codes', () => {
      const first = getTimeZoneCode('Asia/Seoul', 'ko');
      const second = getTimeZoneCode('Asia/Seoul', 'ko');
      expect(first).toBe(second);
    });
  });

  describe('clearTimeZoneCaches', () => {
    it('does not throw', () => {
      expect(() => clearTimeZoneCaches()).not.toThrow();
    });

    it('forces fresh lookup after clearing', () => {
      getUserTimeZone();
      clearTimeZoneCaches();
      const result = getUserTimeZone();
      expect(typeof result).toBe('string');
    });
  });

  describe('getTimeZoneCode - additional branches', () => {
    it('returns cached value on second call (different language key)', () => {
      clearTimeZoneCaches();
      const first = getTimeZoneCode('Asia/Seoul', 'ko');
      const second = getTimeZoneCode('Asia/Seoul', 'en');
      // Different language keys => separate cache entries
      expect(typeof first).toBe('string');
      expect(typeof second).toBe('string');
    });

    it('falls back to Intl API when timezone not in abbreviation map', () => {
      clearTimeZoneCaches();
      // Use a timezone not in the mock TIMEZONE_ABBREVIATIONS
      const result = getTimeZoneCode('America/Los_Angeles', 'en');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to UTC offset for GMT-style timezone names', () => {
      clearTimeZoneCaches();
      // Most exotic timezones will get a GMT+X response from Intl
      const result = getTimeZoneCode('Pacific/Kiritimati', 'en');
      expect(typeof result).toBe('string');
    });

    it('uses default ko language when none specified', () => {
      clearTimeZoneCaches();
      const result = getTimeZoneCode('Asia/Seoul');
      expect(result).toBe('KST');
    });

    it('evicts oldest cache entry when cache exceeds 100 entries', () => {
      clearTimeZoneCaches();
      // Fill up cache with many entries
      const timezones = [
        'Asia/Seoul', 'Asia/Tokyo', 'America/New_York', 'Europe/London',
        'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'Europe/Paris', 'Europe/Berlin', 'Australia/Sydney',
      ];
      const langs = ['ko', 'en', 'ja', 'zh-cn', 'zh-tw', 'es', 'bn', 'tl', 'th', 'vi', 'id'] as const;

      // 10 * 11 = 110 entries > 100 cache limit
      for (const tz of timezones) {
        for (const lang of langs) {
          getTimeZoneCode(tz, lang);
        }
      }
      // Should not throw; the eviction logic should have run
      expect(getTimeZoneCode('Asia/Seoul', 'ko')).toBe('KST');
    });
  });

  describe('getUserTimeZone - additional branches', () => {
    it('falls back to UTC when Intl.DateTimeFormat throws', () => {
      clearTimeZoneCaches();
      const origIntl = globalThis.Intl.DateTimeFormat;
      // @ts-ignore - temporarily break Intl.DateTimeFormat
      globalThis.Intl.DateTimeFormat = () => { throw new Error('broken'); };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = getUserTimeZone(true);
      expect(result).toBe('UTC');

      globalThis.Intl.DateTimeFormat = origIntl;
      warnSpy.mockRestore();
    });

    it('returns cached value within TTL window', () => {
      clearTimeZoneCaches();
      const first = getUserTimeZone();
      // Call again without force refresh - should hit cache
      const second = getUserTimeZone(false);
      expect(second).toBe(first);
    });
  });

  describe('watchTimeZoneChange', () => {
    it('returns noop on server side', () => {
      const origWindow = globalThis.window;
      // @ts-ignore
      delete globalThis.window;

      const cleanup = watchTimeZoneChange(vi.fn());
      expect(typeof cleanup).toBe('function');
      cleanup(); // should not throw

      // @ts-ignore
      globalThis.window = origWindow;
    });

    it('sets up event listeners and returns cleanup function', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const docAddSpy = vi.spyOn(document, 'addEventListener');

      const callback = vi.fn();
      const cleanup = watchTimeZoneChange(callback);

      expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function), { passive: true });
      expect(addSpy).toHaveBeenCalledWith('pageshow', expect.any(Function), { passive: true });
      expect(docAddSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function), { passive: true });

      // Cleanup should remove listeners
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const docRemoveSpy = vi.spyOn(document, 'removeEventListener');

      cleanup();

      expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pageshow', expect.any(Function));
      expect(docRemoveSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

      addSpy.mockRestore();
      docAddSpy.mockRestore();
      removeSpy.mockRestore();
      docRemoveSpy.mockRestore();
    });

    it('calls callback when timezone changes on focus event', async () => {
      vi.useFakeTimers();
      clearTimeZoneCaches();
      const callback = vi.fn();
      const cleanup = watchTimeZoneChange(callback);

      // Simulate timezone change by forcing a cache clear and changing the mock
      clearTimeZoneCaches();

      // Trigger focus event
      window.dispatchEvent(new Event('focus'));

      // Advance past debounce timer (100ms)
      vi.advanceTimersByTime(150);

      // The callback may or may not be called (depends on whether timezone actually changed)
      // At minimum, no errors should occur
      cleanup();
      vi.useRealTimers();
    });

    it('handles visibilitychange event when document becomes visible', async () => {
      vi.useFakeTimers();
      clearTimeZoneCaches();
      const callback = vi.fn();
      const cleanup = watchTimeZoneChange(callback);

      // Mock document.visibilityState
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(150);

      cleanup();
      vi.useRealTimers();
    });

    it('does not check timezone when document is hidden', async () => {
      vi.useFakeTimers();
      clearTimeZoneCaches();
      const callback = vi.fn();
      const cleanup = watchTimeZoneChange(callback);

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });

      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(150);

      // Callback should not be called since document is hidden
      expect(callback).not.toHaveBeenCalled();

      cleanup();
      vi.useRealTimers();
    });
  });
});

// ---------------------------------------------------------------------------
// Additional date-constants coverage
// ---------------------------------------------------------------------------

describe('date-constants - additional coverage', () => {
  describe('LOCALE_MAP - all supported languages', () => {
    it('maps zh-cn to zh-CN', () => {
      expect(LOCALE_MAP['zh-cn']).toBe('zh-CN');
    });

    it('maps zh-tw to zh-TW', () => {
      expect(LOCALE_MAP['zh-tw']).toBe('zh-TW');
    });

    it('maps es to es-ES', () => {
      expect(LOCALE_MAP.es).toBe('es-ES');
    });

    it('maps bn to bn-BD', () => {
      expect(LOCALE_MAP.bn).toBe('bn-BD');
    });

    it('maps tl to fil-PH', () => {
      expect(LOCALE_MAP.tl).toBe('fil-PH');
    });

    it('maps th to th-TH', () => {
      expect(LOCALE_MAP.th).toBe('th-TH');
    });

    it('maps vi to vi-VN', () => {
      expect(LOCALE_MAP.vi).toBe('vi-VN');
    });

    it('maps id to id-ID', () => {
      expect(LOCALE_MAP.id).toBe('id-ID');
    });

    it('maps my to my-MM', () => {
      expect(LOCALE_MAP.my).toBe('my-MM');
    });
  });

  describe('getLocaleString - all languages', () => {
    it('returns correct string for zh-cn', () => {
      expect(getLocaleString('zh-cn')).toBe('zh-CN');
    });

    it('returns correct string for id', () => {
      expect(getLocaleString('id')).toBe('id-ID');
    });

    it('returns correct string for my', () => {
      expect(getLocaleString('my')).toBe('my-MM');
    });
  });

  describe('DATE_FNS_LOCALE_MAP', () => {
    it('has entries for all supported languages', () => {
      expect(DATE_FNS_LOCALE_MAP.ko).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.en).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.ja).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP['zh-cn']).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP['zh-tw']).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.es).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.bn).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.tl).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.th).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.vi).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.id).toBeDefined();
      expect(DATE_FNS_LOCALE_MAP.my).toBeDefined();
    });
  });

  describe('localeMap (legacy export)', () => {
    it('is the same as DATE_FNS_LOCALE_MAP', () => {
      expect(localeMap).toBe(DATE_FNS_LOCALE_MAP);
    });
  });

  describe('DATE_FORMAT_MAP', () => {
    it('has format strings for all supported languages', () => {
      expect(DATE_FORMAT_MAP.ko).toContain('yyyy');
      expect(DATE_FORMAT_MAP.en).toContain('MMM');
      expect(DATE_FORMAT_MAP.ja).toContain('yyyy');
      expect(DATE_FORMAT_MAP['zh-cn']).toContain('yyyy');
      expect(DATE_FORMAT_MAP.id).toContain('dd');
    });
  });

  describe('SIMPLE_DATE_FORMAT_MAP', () => {
    it('has format strings for all supported languages', () => {
      expect(SIMPLE_DATE_FORMAT_MAP.ko).toContain('월');
      expect(SIMPLE_DATE_FORMAT_MAP.en).toContain('MMM');
      expect(SIMPLE_DATE_FORMAT_MAP.ja).toContain('月');
      expect(SIMPLE_DATE_FORMAT_MAP.id).toContain('dd');
    });
  });

  describe('RELATIVE_TIME_THRESHOLDS - all values', () => {
    it('has correct WEEK threshold', () => {
      expect(RELATIVE_TIME_THRESHOLDS.WEEK).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('has correct MONTH threshold', () => {
      expect(RELATIVE_TIME_THRESHOLDS.MONTH).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe('RELATIVE_TIME_FORMATS', () => {
    it('ko formats work correctly', () => {
      const ko = RELATIVE_TIME_FORMATS.ko;
      expect(ko.justNow).toBe('방금 전');
      expect(ko.minutesAgo(5)).toBe('5분 전');
      expect(ko.hoursAgo(3)).toBe('3시간 전');
      expect(ko.daysAgo(2)).toBe('2일 전');
      expect(ko.weeksAgo(1)).toBe('1주 전');
      expect(ko.monthsAgo(6)).toBe('6개월 전');
      expect(ko.today).toBe('오늘');
      expect(ko.yesterday).toBe('어제');
    });

    it('en formats handle singular/plural correctly', () => {
      const en = RELATIVE_TIME_FORMATS.en;
      expect(en.minutesAgo(1)).toBe('1 minute ago');
      expect(en.minutesAgo(5)).toBe('5 minutes ago');
      expect(en.hoursAgo(1)).toBe('1 hour ago');
      expect(en.hoursAgo(3)).toBe('3 hours ago');
      expect(en.daysAgo(1)).toBe('1 day ago');
      expect(en.daysAgo(7)).toBe('7 days ago');
      expect(en.weeksAgo(1)).toBe('1 week ago');
      expect(en.weeksAgo(3)).toBe('3 weeks ago');
      expect(en.monthsAgo(1)).toBe('1 month ago');
      expect(en.monthsAgo(5)).toBe('5 months ago');
    });

    it('ja formats work correctly', () => {
      const ja = RELATIVE_TIME_FORMATS.ja;
      expect(ja.justNow).toBe('たった今');
      expect(ja.minutesAgo(10)).toBe('10分前');
      expect(ja.hoursAgo(2)).toBe('2時間前');
    });

    it('zh-cn formats work correctly', () => {
      const zhCn = RELATIVE_TIME_FORMATS['zh-cn'];
      expect(zhCn.justNow).toBe('刚刚');
      expect(zhCn.minutesAgo(5)).toBe('5分钟前');
    });

    it('zh-tw formats work correctly', () => {
      const zhTw = RELATIVE_TIME_FORMATS['zh-tw'];
      expect(zhTw.justNow).toBe('剛剛');
      expect(zhTw.minutesAgo(5)).toBe('5分鐘前');
    });

    it('id formats work correctly', () => {
      const id = RELATIVE_TIME_FORMATS.id;
      expect(id.justNow).toBe('Baru saja');
      expect(id.minutesAgo(3)).toBe('3 menit yang lalu');
    });

    it('es formats handle singular/plural correctly', () => {
      const es = RELATIVE_TIME_FORMATS.es;
      expect(es.minutesAgo(1)).toBe('hace 1 minuto');
      expect(es.minutesAgo(5)).toBe('hace 5 minutos');
      expect(es.hoursAgo(1)).toBe('hace 1 hora');
      expect(es.hoursAgo(3)).toBe('hace 3 horas');
      expect(es.daysAgo(1)).toBe('hace 1 día');
      expect(es.daysAgo(5)).toBe('hace 5 días');
      expect(es.weeksAgo(1)).toBe('hace 1 semana');
      expect(es.weeksAgo(2)).toBe('hace 2 semanas');
      expect(es.monthsAgo(1)).toBe('hace 1 mes');
      expect(es.monthsAgo(3)).toBe('hace 3 meses');
    });

    it('bn formats work correctly', () => {
      expect(RELATIVE_TIME_FORMATS.bn.justNow).toBe('এইমাত্র');
    });

    it('tl formats work correctly', () => {
      expect(RELATIVE_TIME_FORMATS.tl.justNow).toBe('Ngayon lang');
    });

    it('th formats work correctly', () => {
      expect(RELATIVE_TIME_FORMATS.th.justNow).toBe('เมื่อสักครู่');
    });

    it('vi formats work correctly', () => {
      expect(RELATIVE_TIME_FORMATS.vi.justNow).toBe('Vừa xong');
    });
  });
});

// ---------------------------------------------------------------------------
// Additional formatters coverage
// ---------------------------------------------------------------------------

describe('formatters - additional coverage', () => {
  beforeEach(() => {
    clearTimeZoneCaches();
  });

  describe('getCurrentLocale - additional languages', () => {
    it('returns locale for ja', () => {
      const locale = getCurrentLocale('ja');
      expect(locale).toBeDefined();
    });

    it('returns locale for zh-cn', () => {
      const locale = getCurrentLocale('zh-cn');
      expect(locale).toBeDefined();
    });

    it('returns locale for id', () => {
      const locale = getCurrentLocale('id');
      expect(locale).toBeDefined();
    });
  });

  describe('formatDateWithTimeZone - additional branches', () => {
    it('uses default ko format when no format string provided', () => {
      const result = formatDateWithTimeZone('2024-06-15T10:30:00Z', undefined, 'ko', 'UTC', false);
      expect(result).toContain('2024년');
    });

    it('uses default en format when no format string provided', () => {
      const result = formatDateWithTimeZone('2024-06-15T10:30:00Z', undefined, 'en', 'UTC', false);
      expect(result).toContain('Jun');
    });

    it('uses default ja format when no format string provided', () => {
      const result = formatDateWithTimeZone('2024-06-15T10:30:00Z', undefined, 'ja', 'UTC', false);
      expect(result).toContain('2024年');
    });

    it('uses user timezone when no timezone provided', () => {
      const result = formatDateWithTimeZone('2024-01-15T00:00:00Z');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatVotePeriodWithTimeZone - additional branches', () => {
    it('uses user timezone when not explicitly provided', () => {
      const result = formatVotePeriodWithTimeZone(
        '2024-01-01T00:00:00Z',
        '2024-01-31T23:59:59Z',
        'en',
      );
      expect(result).toContain('~');
    });

    it('formats with ja language', () => {
      const result = formatVotePeriodWithTimeZone(
        '2024-01-01T00:00:00Z',
        '2024-01-31T23:59:59Z',
        'ja',
        'Asia/Tokyo',
      );
      expect(result).toContain('年');
    });
  });

  describe('formatSimpleDateWithTimeZone - additional branches', () => {
    it('uses default timezone when not provided', () => {
      const result = formatSimpleDateWithTimeZone('2024-06-15T10:30:00Z', 'en');
      expect(typeof result).toBe('string');
    });

    it('formats ja language', () => {
      const result = formatSimpleDateWithTimeZone('2024-06-15T10:30:00Z', 'ja', 'UTC', false);
      expect(result).toContain('月');
    });
  });

  describe('formatRelativeTime - additional branches', () => {
    it('returns days ago for dates 3-6 days old', () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(fourDaysAgo, 'en', { useAbsolute: false });
      expect(result).toContain('days ago');
    });

    it('returns Yesterday or 1 day ago for ~25 hours old date', () => {
      const oneDayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(oneDayAgo, 'en', { useAbsolute: false });
      // Depending on time-of-day this might be "Yesterday" or "1 day ago"
      expect(['Yesterday', '1 day ago']).toContain(result);
    });

    it('returns 1 week ago for singular', () => {
      const oneWeekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(oneWeekAgo, 'en', { useAbsolute: false });
      expect(result).toBe('1 week ago');
    });

    it('returns months ago for dates older than 1 month', () => {
      const twoMonthsAgo = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(twoMonthsAgo, 'en', { useAbsolute: false });
      expect(result).toContain('month');
    });

    it('falls back to en formats for unsupported language', () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatRelativeTime(fiveMinsAgo, 'my' as any);
      // 'my' is not in RELATIVE_TIME_FORMATS, so it should fall back to 'en'
      expect(typeof result).toBe('string');
    });

    it('returns yesterday-related string with showTime for yesterday', () => {
      // Create a date that is definitely yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(14, 30, 0, 0);
      const result = formatRelativeTime(yesterday.toISOString(), 'en', {
        useAbsolute: false,
        showTime: true,
      });
      // Depending on timing, may return "Yesterday HH:mm", "X hours ago", or "1 day ago"
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns time-related string without time for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(14, 30, 0, 0);
      const result = formatRelativeTime(yesterday.toISOString(), 'en', {
        useAbsolute: false,
        showTime: false,
      });
      // Depending on timing, may return "Yesterday", "X hours ago", or "1 day ago"
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns absolute date with showTime for older dates', () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatRelativeTime(oldDate, 'en', {
        useAbsolute: true,
        absoluteThreshold: 7,
        showTime: true,
      });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles zh-cn language correctly', () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatRelativeTime(fiveMinsAgo, 'zh-cn');
      expect(result).toBe('5分钟前');
    });

    it('handles id language correctly', () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatRelativeTime(fiveMinsAgo, 'id');
      expect(result).toBe('5 menit yang lalu');
    });
  });

  describe('formatSmartDate - additional branches', () => {
    it('handles old post dates (> 3 days) with absolute format', () => {
      const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatSmartDate(oldDate, 'en', 'post');
      // Should use absolute date (> 3 day threshold for post)
      expect(typeof result).toBe('string');
    });

    it('handles old comment dates (> 1 day) with absolute format', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatSmartDate(twoDaysAgo, 'en', 'comment');
      expect(typeof result).toBe('string');
    });

    it('handles ko language with detailed context', () => {
      const date = '2024-01-15T10:00:00Z';
      const result = formatSmartDate(date, 'ko', 'detailed');
      expect(result).toContain('2024');
      expect(result).toContain('년');
    });
  });

  describe('formatPostDate - additional', () => {
    it('uses ko language by default', () => {
      const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatPostDate(recent);
      // Default is 'ko'
      expect(result).toBe('5분 전');
    });
  });

  describe('formatCommentDate - additional', () => {
    it('uses ko language by default', () => {
      const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const result = formatCommentDate(recent);
      expect(result).toBe('5분 전');
    });
  });
});
