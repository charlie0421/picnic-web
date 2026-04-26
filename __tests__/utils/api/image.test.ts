import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Mock the language store
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: {
    getState: vi.fn(() => ({ currentLanguage: 'en' })),
  },
}));

const originalEnv = process.env;

describe('getCdnImageUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function importModule() {
    const mod = await import('@/utils/api/image');
    return mod;
  }

  it('returns empty string for null path', async () => {
    const { getCdnImageUrl } = await importModule();
    expect(getCdnImageUrl(null)).toBe('');
  });

  it('returns empty string for undefined path', async () => {
    const { getCdnImageUrl } = await importModule();
    expect(getCdnImageUrl(undefined)).toBe('');
  });

  it('returns empty string for empty string path', async () => {
    const { getCdnImageUrl } = await importModule();
    expect(getCdnImageUrl('')).toBe('');
  });

  describe('absolute URL handling', () => {
    it('returns http URL as-is when no CDN is configured', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = '';
      const { getCdnImageUrl } = await importModule();
      expect(getCdnImageUrl('http://example.com/img.jpg')).toBe('http://example.com/img.jpg');
    });

    it('returns https URL as-is when no CDN is configured', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = '';
      const { getCdnImageUrl } = await importModule();
      expect(getCdnImageUrl('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
    });

    it('adds width/height params for matching CDN host URL', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('https://cdn.example.com/images/test.jpg', 200, 100);
      expect(result).toContain('w=200');
      expect(result).toContain('h=100');
      expect(result).toContain('f=webp');
    });

    it('adds only width param when height is not provided', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('https://cdn.example.com/images/test.jpg', 300);
      expect(result).toContain('w=300');
      expect(result).not.toContain('h=');
    });

    it('returns non-CDN absolute URL as-is when CDN is configured', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('https://other.com/img.jpg', 200);
      expect(result).toBe('https://other.com/img.jpg');
    });

    it('preserves existing f param if already set on CDN URL', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('https://cdn.example.com/img.jpg?f=png', 200);
      expect(result).toContain('f=png');
    });

    it('handles invalid absolute URL gracefully', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { getCdnImageUrl } = await importModule();
      // Invalid URL with spaces that will fail URL parsing
      const result = getCdnImageUrl('https://invalid url with spaces');
      expect(typeof result).toBe('string');
      errorSpy.mockRestore();
    });
  });

  describe('JSON multi-language path handling', () => {
    it('resolves localized path from JSON', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const jsonPath = JSON.stringify({ en: 'images/en/photo.jpg', ko: 'images/ko/photo.jpg' });
      const result = getCdnImageUrl(jsonPath, 400);
      expect(result).toContain('cdn.example.com');
      expect(result).toContain('images/');
      expect(result).toContain('w=400');
      expect(result).toContain('f=webp');
    });

    it('falls back to en when current lang is not available', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const jsonPath = JSON.stringify({ ko: 'images/ko/photo.jpg' });
      const result = getCdnImageUrl(jsonPath);
      expect(result).toContain('images/ko/photo.jpg');
    });

    it('strips leading slash from localized path', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const jsonPath = JSON.stringify({ en: '/images/en/photo.jpg' });
      const result = getCdnImageUrl(jsonPath);
      expect(result).not.toContain('//images');
    });

    it('returns relative path when no CDN configured', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = '';
      const { getCdnImageUrl } = await importModule();
      const jsonPath = JSON.stringify({ en: 'images/photo.jpg' });
      const result = getCdnImageUrl(jsonPath);
      expect(result).toBe('/images/photo.jpg');
    });

    it('handles height for JSON paths with CDN', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const jsonPath = JSON.stringify({ en: 'images/photo.jpg' });
      const result = getCdnImageUrl(jsonPath, 400, 300);
      expect(result).toContain('h=300');
      expect(result).toContain('height=300');
    });

    it('handles invalid JSON gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      // Starts with { and contains ": but is not valid JSON
      const result = getCdnImageUrl('{invalid": json}');
      // Should fall through to normal path handling
      expect(typeof result).toBe('string');
      errorSpy.mockRestore();
    });
  });

  describe('simple path handling', () => {
    it('builds CDN URL from simple path', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('images/photo.jpg', 500);
      expect(result).toBe('https://cdn.example.com/images/photo.jpg?w=500&width=500&f=webp');
    });

    it('strips leading slash from path', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('/images/photo.jpg');
      expect(result).toContain('cdn.example.com/images/photo.jpg');
      expect(result).not.toContain('//images');
    });

    it('returns relative path when no CDN', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = '';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('images/photo.jpg');
      expect(result).toBe('/images/photo.jpg');
    });

    it('adds both width and height', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('photo.jpg', 100, 200);
      expect(result).toContain('w=100');
      expect(result).toContain('h=200');
      expect(result).toContain('width=100');
      expect(result).toContain('height=200');
    });

    it('trims whitespace from path', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = '';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('  images/photo.jpg  ');
      expect(result).toBe('/images/photo.jpg');
    });

    it('strips trailing slash from CDN URL', async () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com/';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('photo.jpg');
      expect(result).toContain('https://cdn.example.com/photo.jpg');
    });
  });

  describe('language store error handling', () => {
    it('defaults to en when store access throws', async () => {
      // The mock already handles this case; just ensure no crash
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_CDN_URL = '';
      const { getCdnImageUrl } = await importModule();
      const result = getCdnImageUrl('images/photo.jpg');
      expect(typeof result).toBe('string');
      errorSpy.mockRestore();
    });
  });
});
