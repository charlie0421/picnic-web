import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase server client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockLte = vi.fn();
const mockOr = vi.fn();
const mockIn = vi.fn();
const mockSingle = vi.fn();

const createChainMock = (data: any = null, error: any = null) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: undefined as any,
  };
  // Make the chain itself thenable by resolving with { data, error }
  const result = Object.assign(chain, {
    then: (resolve: any) => resolve({ data, error }),
  });
  // Make each terminal method resolve
  chain.order.mockReturnValue(result);
  chain.limit.mockReturnValue(result);
  chain.or.mockReturnValue(result);
  chain.in.mockReturnValue(result);
  return chain;
};

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseClient: vi.fn(),
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: {
    getState: () => ({ currentLanguage: 'en' }),
  },
}));

vi.mock('@/config/settings', () => ({
  DEFAULT_LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: ['en', 'ko', 'ja'],
  settings: {
    languages: {
      supported: ['en', 'ko', 'ja'],
      default: 'en',
    },
  },
}));

import { withTimeout, logRequestError, SUPABASE_TIMEOUT_MS, DEFAULT_REWARD_LIMIT, FALLBACK_VOTES, FALLBACK_REWARDS } from '@/utils/api/queries-helpers';
import { getLocalizedString, getLocalizedJson, hasValidLocalizedString } from '@/utils/api/strings';
import { getLanguageFromParams } from '@/utils/api/language';
import { transformBannerLink, transformAppLinkToWebLink } from '@/utils/api/link-transformer';
import { withRetry, withTimeout as withTimeoutRetry } from '@/utils/api/retry-utils';

describe('queries-helpers', () => {
  describe('SUPABASE_TIMEOUT_MS', () => {
    it('is 4000ms', () => {
      expect(SUPABASE_TIMEOUT_MS).toBe(4000);
    });
  });

  describe('DEFAULT_REWARD_LIMIT', () => {
    it('is 24', () => {
      expect(DEFAULT_REWARD_LIMIT).toBe(24);
    });
  });

  describe('FALLBACK_VOTES', () => {
    it('is an empty array', () => {
      expect(FALLBACK_VOTES).toEqual([]);
    });
  });

  describe('FALLBACK_REWARDS', () => {
    it('is an array with one sample reward', () => {
      expect(FALLBACK_REWARDS).toHaveLength(1);
      expect(FALLBACK_REWARDS[0].id).toBe(-1);
    });
  });

  describe('withTimeout', () => {
    it('resolves with promise result before timeout', async () => {
      const result = await withTimeout(
        Promise.resolve('data'),
        'fallback',
        'test',
        5000,
      );
      expect(result).toBe('data');
    });

    it('resolves with fallback on timeout', async () => {
      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('slow'), 5000);
      });
      const result = await withTimeout(slowPromise, 'fallback', 'test', 10);
      expect(result).toBe('fallback');
    });

    it('uses default timeout when not specified', async () => {
      const result = await withTimeout(Promise.resolve('quick'), 'fallback', 'test');
      expect(result).toBe('quick');
    });
  });

  describe('logRequestError', () => {
    it('logs error and returns it', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('test error');
      const result = logRequestError(error, 'testFunction');
      expect(result).toBe(error);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('strings', () => {
  describe('hasValidLocalizedString', () => {
    it('returns false for null', () => {
      expect(hasValidLocalizedString(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(hasValidLocalizedString(undefined)).toBe(false);
    });

    it('returns true for non-empty string', () => {
      expect(hasValidLocalizedString('hello')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(hasValidLocalizedString('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(hasValidLocalizedString('   ')).toBe(false);
    });

    it('returns true for number', () => {
      expect(hasValidLocalizedString(42)).toBe(true);
    });

    it('returns true for object with valid translations', () => {
      expect(hasValidLocalizedString({ en: 'Hello', ko: 'Korean' })).toBe(true);
    });

    it('returns false for object with all empty translations', () => {
      expect(hasValidLocalizedString({ en: '', ko: '  ' })).toBe(false);
    });
  });

  describe('getLocalizedString', () => {
    it('returns empty string for null', () => {
      expect(getLocalizedString(null)).toBe('');
    });

    it('returns trimmed string for string input', () => {
      expect(getLocalizedString('  hello  ')).toBe('hello');
    });

    it('returns number as string', () => {
      expect(getLocalizedString(42 as any)).toBe('42');
    });

    it('returns value for specified language', () => {
      const value = { en: 'English', ko: 'Korean' };
      expect(getLocalizedString(value, 'ko')).toBe('Korean');
    });

    it('falls back to English when language not found', () => {
      const value = { en: 'English' };
      expect(getLocalizedString(value, 'ja')).toBe('English');
    });

    it('falls back to first available translation', () => {
      const value = { ko: 'Korean only' };
      expect(getLocalizedString(value, 'ja')).toBe('Korean only');
    });

    it('returns empty string for object with all empty values', () => {
      const value = { en: '', ko: '  ' };
      expect(getLocalizedString(value, 'en')).toBe('');
    });

    it('uses en as default on server side', () => {
      const value = { en: 'English', ko: 'Korean' };
      // When no currentLang is provided and we're in test (no window sometimes)
      const result = getLocalizedString(value);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getLocalizedJson', () => {
    it('returns null for null input', () => {
      expect(getLocalizedJson(null)).toBeNull();
    });

    it('returns trimmed string for string input', () => {
      expect(getLocalizedJson('  hello  ')).toBe('hello');
    });

    it('returns null for empty string', () => {
      expect(getLocalizedJson('  ')).toBeNull();
    });

    it('returns number for number input', () => {
      expect(getLocalizedJson(42)).toBe(42);
    });

    it('returns value for specified language', () => {
      const value = { en: 'English data', ko: 'Korean data' };
      expect(getLocalizedJson(value, 'en')).toBe('English data');
    });

    it('falls back to English when language not found', () => {
      const value = { en: 'English data' };
      expect(getLocalizedJson(value, 'ja')).toBe('English data');
    });

    it('falls back to first available value', () => {
      const value = { ko: 'Korean only data' };
      expect(getLocalizedJson(value, 'ja')).toBe('Korean only data');
    });

    it('returns null for object with all empty values', () => {
      expect(getLocalizedJson({ en: '', ko: '  ' })).toBeNull();
    });
  });
});

describe('language', () => {
  describe('getLanguageFromParams', () => {
    it('returns the language when it is supported', () => {
      expect(getLanguageFromParams({ lang: 'ko' })).toBe('ko');
      expect(getLanguageFromParams({ lang: 'en' })).toBe('en');
      expect(getLanguageFromParams({ lang: 'ja' })).toBe('ja');
    });

    it('returns default language for unsupported language', () => {
      expect(getLanguageFromParams({ lang: 'xx' })).toBe('en');
    });
  });
});

describe('link-transformer', () => {
  describe('transformBannerLink', () => {
    it('returns input as-is for empty string', () => {
      expect(transformBannerLink('')).toBe('');
    });

    it('replaces applink.picnic.fan with www.picnic.fan', () => {
      const result = transformBannerLink('https://applink.picnic.fan/vote/123');
      expect(result).toContain('www.picnic.fan');
      expect(result).not.toContain('applink.picnic.fan');
    });

    it('replaces /vote/detail/ with /vote/', () => {
      const result = transformBannerLink('https://www.picnic.fan/vote/detail/123');
      expect(result).toContain('/vote/123');
      expect(result).not.toContain('/vote/detail/');
    });

    it('adds language prefix for picnic.fan URLs', () => {
      const result = transformBannerLink('https://www.picnic.fan/vote/123', 'ko');
      expect(result).toContain('/ko/vote/123');
    });

    it('does not add duplicate language prefix', () => {
      const result = transformBannerLink('/ko/vote/123', 'ko');
      expect(result).toBe('/ko/vote/123');
    });

    it('adds language prefix to relative paths', () => {
      const result = transformBannerLink('/vote/123', 'en');
      expect(result).toBe('/en/vote/123');
    });

    it('does not add prefix if locale is already present', () => {
      const result = transformBannerLink('/en/vote/123', 'ko');
      // Already has /en prefix, which is a known locale
      expect(result).toBe('/en/vote/123');
    });

    it('returns original link on error (invalid URL)', () => {
      // This should not throw, just return as transformed as possible
      const result = transformBannerLink('some-link');
      expect(typeof result).toBe('string');
    });
  });

  describe('transformAppLinkToWebLink', () => {
    it('returns input as-is for empty string', () => {
      expect(transformAppLinkToWebLink('')).toBe('');
    });

    it('replaces applink.picnic.fan with www.picnic.fan', () => {
      const result = transformAppLinkToWebLink('https://applink.picnic.fan/page');
      expect(result).toContain('www.picnic.fan');
    });

    it('replaces /vote/detail/ with /vote/', () => {
      const result = transformAppLinkToWebLink('https://www.picnic.fan/vote/detail/5');
      expect(result).toContain('/vote/5');
    });

    it('applies multiple transformations', () => {
      const result = transformAppLinkToWebLink('https://applink.picnic.fan/vote/detail/5');
      expect(result).toContain('www.picnic.fan');
      expect(result).toContain('/vote/5');
    });

    it('returns original on error', () => {
      const link = 'https://normal.com/page';
      expect(transformAppLinkToWebLink(link)).toBe(link);
    });
  });
});

describe('retry-utils', () => {
  describe('withRetry', () => {
    it('returns a function', () => {
      const fn = vi.fn().mockResolvedValue('data');
      const retried = withRetry(fn);
      expect(typeof retried).toBe('function');
    });

    it('calls original function on success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const retried = withRetry(fn);
      const result = await retried();
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('recovered');
      const retried = withRetry(fn, { maxRetries: 2, initialDelay: 1, maxDelay: 2, factor: 1 });
      const result = await retried();
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));
      const retried = withRetry(fn, { maxRetries: 1, initialDelay: 1, maxDelay: 2, factor: 1 });
      await expect(retried()).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('calls onRetry callback on each retry', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');
      const retried = withRetry(fn, { maxRetries: 2, initialDelay: 1, maxDelay: 2, factor: 1, onRetry });
      await retried();
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('passes arguments through to the original function', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const retried = withRetry(fn);
      await retried('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('withTimeout (retry-utils)', () => {
    it('returns a function', () => {
      const fn = vi.fn().mockResolvedValue('data');
      const wrapped = withTimeoutRetry(fn);
      expect(typeof wrapped).toBe('function');
    });

    it('resolves before timeout', async () => {
      const fn = vi.fn().mockResolvedValue('fast');
      const wrapped = withTimeoutRetry(fn, 5000);
      const result = await wrapped();
      expect(result).toBe('fast');
    });

    it('rejects on timeout', async () => {
      const fn = vi.fn(() => new Promise(resolve => setTimeout(() => resolve('slow'), 5000)));
      const wrapped = withTimeoutRetry(fn, 10);
      await expect(wrapped()).rejects.toThrow('타임아웃');
    });
  });
});
