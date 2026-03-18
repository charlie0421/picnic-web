import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('@/config/settings', () => ({
  DEFAULT_LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: ['en', 'ko', 'ja'],
  settings: { languages: { supported: ['en', 'ko', 'ja'], default: 'en' } },
}));

vi.mock('@/utils/image/types', () => ({
  ENABLE_AVATAR_DEBUG: false,
  hasTransformOptions: vi.fn((opts: any) => Boolean(opts?.width || opts?.height)),
  SUPABASE_RENDER_PATH: '/storage/v1/render/image/',
  SUPABASE_RENDER_SIGN_PATH: '/storage/v1/render/image/sign/',
  SUPABASE_OBJECT_PATH: '/storage/v1/object/',
}));

const mockExtractRef = vi.fn();
const mockFetchSigned = vi.fn();
const mockSendDebugLog = vi.fn();
const mockBuildObjectUrl = vi.fn();

vi.mock('@/utils/image/supabase-storage', () => ({
  extractSupabaseStorageReference: (...args: any[]) => mockExtractRef(...args),
  fetchSignedSupabaseImageUrl: (...args: any[]) => mockFetchSigned(...args),
  sendAvatarDebugLog: (...args: any[]) => mockSendDebugLog(...args),
  buildSupabaseObjectUrl: (...args: any[]) => mockBuildObjectUrl(...args),
}));

const mockIsValidImageUrl = vi.fn();
const mockGetSafeAvatarUrl = vi.fn();

vi.mock('@/utils/image/provider-avatar', () => ({
  isValidImageUrl: (...args: any[]) => mockIsValidImageUrl(...args),
  getSafeAvatarUrl: (...args: any[]) => mockGetSafeAvatarUrl(...args),
}));

const mockBuildFallbackCandidates = vi.fn();
const mockTryLoadCandidates = vi.fn();
const mockTryObjectUrlMock = vi.fn();

vi.mock('@/utils/image/avatar-resolver-fallback', () => ({
  buildFallbackCandidates: (...args: any[]) => mockBuildFallbackCandidates(...args),
  tryLoadCandidates: (...args: any[]) => mockTryLoadCandidates(...args),
  tryObjectUrl: (...args: any[]) => mockTryObjectUrlMock(...args),
}));

import { resolveAvatarUrlClient, preloadImage } from '@/utils/image/avatar-resolver';

// Helper to replace Image constructor
function mockImageLoad(callback: 'onload' | 'onerror' | 'none') {
  const origImage = globalThis.Image;
  // @ts-ignore
  globalThis.Image = function MockImage(this: any) {
    this.onload = null;
    this.onerror = null;
    this.src = '';
    if (callback === 'onload') {
      setTimeout(() => this.onload?.(), 0);
    } else if (callback === 'onerror') {
      setTimeout(() => this.onerror?.(), 0);
    }
    // 'none' = no callback (for timeout test)
  };
  return () => { globalThis.Image = origImage; };
}

describe('avatar-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractRef.mockReturnValue(null);
    mockFetchSigned.mockResolvedValue(null);
    mockGetSafeAvatarUrl.mockImplementation((url: string) => url || '/images/default-avatar.svg');
    mockIsValidImageUrl.mockReturnValue(true);
    mockBuildFallbackCandidates.mockResolvedValue([]);
    mockTryLoadCandidates.mockResolvedValue(null);
    mockTryObjectUrlMock.mockResolvedValue(null);
  });

  describe('resolveAvatarUrlClient', () => {
    it('returns fallback when avatarUrl is null', async () => {
      const result = await resolveAvatarUrlClient(null);
      expect(result).toEqual({ url: '/images/default-avatar.svg', isFallback: true, isSigned: false });
    });

    it('returns fallback when avatarUrl is undefined', async () => {
      const result = await resolveAvatarUrlClient(undefined);
      expect(result).toEqual({ url: '/images/default-avatar.svg', isFallback: true, isSigned: false });
    });

    it('returns fallback when avatarUrl is empty string', async () => {
      const result = await resolveAvatarUrlClient('');
      expect(result).toEqual({ url: '/images/default-avatar.svg', isFallback: true, isSigned: false });
    });

    it('uses SSR path when window is undefined', async () => {
      const origWindow = globalThis.window;
      // @ts-ignore
      delete globalThis.window;
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');
      const result = await resolveAvatarUrlClient('https://example.com/avatar.jpg');
      expect(result).toEqual({ url: 'https://example.com/avatar.jpg', isFallback: false, isSigned: false });
      // @ts-ignore
      globalThis.window = origWindow;
    });

    it('SSR returns fallback when resolved matches fallbackUrl', async () => {
      const origWindow = globalThis.window;
      // @ts-ignore
      delete globalThis.window;
      mockGetSafeAvatarUrl.mockReturnValue('/images/default-avatar.svg');
      const result = await resolveAvatarUrlClient('bad-url');
      expect(result.isFallback).toBe(true);
      // @ts-ignore
      globalThis.window = origWindow;
    });

    it('uses custom fallbackUrl', async () => {
      const result = await resolveAvatarUrlClient(null, {}, { fallbackUrl: '/custom.png' });
      expect(result.url).toBe('/custom.png');
    });

    it('fetches signed URL for unsigned storage reference', async () => {
      const ref = { bucket: 'avatars', path: 'user/img.jpg', isSigned: false, isPublic: true };
      mockExtractRef.mockReturnValue(ref);
      mockFetchSigned.mockResolvedValue('https://signed-url.com/img');
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');

      const restore = mockImageLoad('onload');
      const result = await resolveAvatarUrlClient('https://example.com/avatar.jpg');
      expect(mockFetchSigned).toHaveBeenCalled();
      expect(result.url).toBe('https://signed-url.com/img');
      expect(result.isSigned).toBe(true);
      restore();
    });

    it('throws AbortError when signal is already aborted', async () => {
      const ref = { bucket: 'avatars', path: 'user/img.jpg', isSigned: false, isPublic: true };
      mockExtractRef.mockReturnValue(ref);
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');
      const controller = new AbortController();
      controller.abort();
      await expect(
        resolveAvatarUrlClient('https://example.com/avatar.jpg', {}, { signal: controller.signal })
      ).rejects.toThrow('Aborted');
    });

    it('falls back when initial preload fails', async () => {
      mockExtractRef.mockReturnValue(null);
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const restore = mockImageLoad('onerror');

      const result = await resolveAvatarUrlClient('https://example.com/avatar.jpg');
      expect(result.url).toBe('/images/default-avatar.svg');
      expect(result.isFallback).toBe(true);
      restore();
      warnSpy.mockRestore();
    });

    it('returns successful result from fallback candidates', async () => {
      mockExtractRef.mockReturnValue(null);
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');
      mockTryLoadCandidates.mockResolvedValue({
        url: 'https://fallback.com/img.jpg', isFallback: false, isSigned: false,
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const restore = mockImageLoad('onerror');

      const result = await resolveAvatarUrlClient('https://example.com/avatar.jpg');
      expect(result.url).toBe('https://fallback.com/img.jpg');
      restore();
      warnSpy.mockRestore();
    });

    it('tries object URL as last resort when reference exists', async () => {
      const ref = { bucket: 'avatars', path: 'user/img.jpg', isSigned: true, isPublic: true };
      mockExtractRef.mockReturnValue(ref);
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');
      mockTryLoadCandidates.mockResolvedValue(null);
      mockTryObjectUrlMock.mockResolvedValue({
        url: 'https://object.com/img.jpg', isFallback: false, isSigned: true,
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const restore = mockImageLoad('onerror');

      const result = await resolveAvatarUrlClient('https://example.com/avatar.jpg');
      expect(result.url).toBe('https://object.com/img.jpg');
      expect(mockTryObjectUrlMock).toHaveBeenCalled();
      restore();
      warnSpy.mockRestore();
    });

    it('returns fallback with empty finalUrl', async () => {
      mockExtractRef.mockReturnValue(null);
      // Return empty string from all getSafeAvatarUrl calls
      mockGetSafeAvatarUrl.mockReturnValue('');
      // Need to mock Image because the fallbackUrl will be tried via preloadImage
      const restore = mockImageLoad('onerror');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await resolveAvatarUrlClient('some-url');
      expect(result.isFallback).toBe(true);
      restore();
      warnSpy.mockRestore();
    });

    it('handles preloadImage returning false (not error)', async () => {
      mockExtractRef.mockReturnValue(null);
      mockGetSafeAvatarUrl.mockReturnValue('https://example.com/avatar.jpg');
      mockIsValidImageUrl.mockReturnValue(false);
      const result = await resolveAvatarUrlClient('https://example.com/avatar.jpg');
      expect(result.isFallback).toBe(true);
    });
  });

  describe('preloadImage', () => {
    it('resolves false for invalid URL', async () => {
      mockIsValidImageUrl.mockReturnValue(false);
      const result = await preloadImage('invalid');
      expect(result).toBe(false);
    });

    it('resolves true when image loads successfully', async () => {
      mockIsValidImageUrl.mockReturnValue(true);
      const restore = mockImageLoad('onload');
      const result = await preloadImage('https://example.com/img.jpg');
      expect(result).toBe(true);
      restore();
    });

    it('resolves false when image fails to load', async () => {
      mockIsValidImageUrl.mockReturnValue(true);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const restore = mockImageLoad('onerror');
      const result = await preloadImage('https://example.com/img.jpg');
      expect(result).toBe(false);
      restore();
      warnSpy.mockRestore();
    });

    it('resolves false on timeout (5 seconds)', async () => {
      vi.useFakeTimers();
      mockIsValidImageUrl.mockReturnValue(true);
      const restore = mockImageLoad('none');
      const promise = preloadImage('https://example.com/img.jpg');
      vi.advanceTimersByTime(5001);
      const result = await promise;
      expect(result).toBe(false);
      restore();
      vi.useRealTimers();
    });
  });
});

// ---------------------------------------------------------------------------
// avatar-resolver-fallback.ts tests using vi.importActual
// ---------------------------------------------------------------------------

describe('avatar-resolver-fallback', () => {
  let realModule: Awaited<ReturnType<typeof vi.importActual<typeof import('@/utils/image/avatar-resolver-fallback')>>>;

  beforeAll(async () => {
    realModule = await vi.importActual<typeof import('@/utils/image/avatar-resolver-fallback')>(
      '@/utils/image/avatar-resolver-fallback'
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildObjectUrl.mockReturnValue(null);
    mockFetchSigned.mockResolvedValue(null);
  });

  describe('buildFallbackCandidates', () => {
    it('returns empty array when no reference and URLs match', async () => {
      const result = await realModule.buildFallbackCandidates({
        reference: null, wasSigned: false, hasTransformOpts: false,
        originalUrlWithoutTransform: 'https://example.com/img.jpg',
        avatarUrl: 'https://example.com/img.jpg',
        finalUrl: 'https://example.com/img.jpg',
        fallbackUrl: '/default.svg', transform: {}, options: {},
      });
      expect(result).toEqual([]);
    });

    it('adds signed-without-transform candidate when wasSigned and hasTransformOpts', async () => {
      const ref = { bucket: 'avatars', path: 'img.jpg', isSigned: false, isPublic: true };
      mockFetchSigned.mockResolvedValue('https://signed-no-transform.com/img');
      const result = await realModule.buildFallbackCandidates({
        reference: ref, wasSigned: true, hasTransformOpts: true,
        originalUrlWithoutTransform: 'https://example.com/img.jpg',
        avatarUrl: 'https://example.com/avatar.jpg',
        finalUrl: 'https://example.com/img.jpg',
        fallbackUrl: '/default.svg', transform: { width: 100 }, options: {},
      });
      expect(result).toContainEqual({ url: 'https://signed-no-transform.com/img', isSigned: true });
    });

    it('adds object URL when reference is not signed', async () => {
      const ref = { bucket: 'avatars', path: 'img.jpg', isSigned: false, isPublic: true };
      mockBuildObjectUrl.mockReturnValue('https://object.com/img');
      const result = await realModule.buildFallbackCandidates({
        reference: ref, wasSigned: false, hasTransformOpts: false,
        originalUrlWithoutTransform: 'https://final.com/img.jpg',
        avatarUrl: 'https://final.com/img.jpg',
        finalUrl: 'https://final.com/img.jpg',
        fallbackUrl: '/default.svg', transform: {}, options: {},
      });
      expect(result).toContainEqual({ url: 'https://object.com/img', isSigned: false });
    });

    it('adds originalUrlWithoutTransform when different from finalUrl and fallbackUrl', async () => {
      const result = await realModule.buildFallbackCandidates({
        reference: null, wasSigned: false, hasTransformOpts: false,
        originalUrlWithoutTransform: 'https://original.com/img.jpg',
        avatarUrl: 'https://original.com/img.jpg',
        finalUrl: 'https://final.com/img.jpg',
        fallbackUrl: '/default.svg', transform: {}, options: {},
      });
      expect(result).toContainEqual({ url: 'https://original.com/img.jpg', isSigned: false });
    });

    it('adds avatarUrl when different from finalUrl', async () => {
      const result = await realModule.buildFallbackCandidates({
        reference: null, wasSigned: false, hasTransformOpts: false,
        originalUrlWithoutTransform: 'https://final.com/img.jpg',
        avatarUrl: 'https://avatar.com/img.jpg',
        finalUrl: 'https://final.com/img.jpg',
        fallbackUrl: '/default.svg', transform: {}, options: {},
      });
      expect(result).toContainEqual({ url: 'https://avatar.com/img.jpg', isSigned: false });
    });

    it('does not add URLs that equal fallbackUrl', async () => {
      const result = await realModule.buildFallbackCandidates({
        reference: null, wasSigned: false, hasTransformOpts: false,
        originalUrlWithoutTransform: '/default.svg',
        avatarUrl: '/default.svg',
        finalUrl: '/default.svg',
        fallbackUrl: '/default.svg', transform: {}, options: {},
      });
      expect(result).toEqual([]);
    });

    it('throws AbortError if signal aborted during signed URL fetch', async () => {
      const ref = { bucket: 'avatars', path: 'img.jpg', isSigned: false, isPublic: true };
      const controller = new AbortController();
      mockFetchSigned.mockImplementation(async () => {
        controller.abort();
        return 'https://signed.com/img';
      });
      await expect(
        realModule.buildFallbackCandidates({
          reference: ref, wasSigned: true, hasTransformOpts: true,
          originalUrlWithoutTransform: '', avatarUrl: '', finalUrl: '',
          fallbackUrl: '/default.svg', transform: { width: 100 },
          options: { signal: controller.signal },
        })
      ).rejects.toThrow('Aborted');
    });
  });

  describe('tryLoadCandidates', () => {
    it('returns null for empty array', async () => {
      const result = await realModule.tryLoadCandidates([], {}, vi.fn(), vi.fn());
      expect(result).toBeNull();
    });

    it('skips candidates with empty URL', async () => {
      const preload = vi.fn();
      const result = await realModule.tryLoadCandidates(
        [{ url: '', isSigned: false }], {}, vi.fn(), preload,
      );
      expect(result).toBeNull();
      expect(preload).not.toHaveBeenCalled();
    });

    it('returns first successfully loaded candidate', async () => {
      const preload = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const result = await realModule.tryLoadCandidates(
        [
          { url: 'https://fail.com/img.jpg', isSigned: false },
          { url: 'https://success.com/img.jpg', isSigned: true },
        ],
        {}, vi.fn(), preload,
      );
      expect(result).toEqual({ url: 'https://success.com/img.jpg', isFallback: false, isSigned: true });
    });

    it('returns null when all candidates fail', async () => {
      const preload = vi.fn().mockResolvedValue(false);
      const result = await realModule.tryLoadCandidates(
        [{ url: 'https://a.com/img.jpg', isSigned: false }],
        {}, vi.fn(), preload,
      );
      expect(result).toBeNull();
    });

    it('throws AbortError when signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        realModule.tryLoadCandidates(
          [{ url: 'https://example.com/img.jpg', isSigned: false }],
          { signal: controller.signal }, vi.fn(), vi.fn(),
        )
      ).rejects.toThrow('Aborted');
    });

    it('handles preload throwing non-abort error', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const preload = vi.fn().mockRejectedValue(new Error('load fail'));
      const result = await realModule.tryLoadCandidates(
        [{ url: 'https://example.com/img.jpg', isSigned: false }],
        {}, vi.fn(), preload,
      );
      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('tryObjectUrl', () => {
    it('returns null when buildSupabaseObjectUrl returns null', async () => {
      mockBuildObjectUrl.mockReturnValue(null);
      const result = await realModule.tryObjectUrl(
        { bucket: 'b', path: 'p', isSigned: false, isPublic: true },
        vi.fn(), vi.fn(),
      );
      expect(result).toBeNull();
    });

    it('returns success when preload succeeds', async () => {
      mockBuildObjectUrl.mockReturnValue('https://object.example.com/img');
      const preload = vi.fn().mockResolvedValue(true);
      const result = await realModule.tryObjectUrl(
        { bucket: 'b', path: 'p', isSigned: false, isPublic: true },
        vi.fn(), preload,
      );
      expect(result).toEqual({ url: 'https://object.example.com/img', isFallback: false, isSigned: false });
    });

    it('returns null when preload resolves false', async () => {
      mockBuildObjectUrl.mockReturnValue('https://object.example.com/img');
      const preload = vi.fn().mockResolvedValue(false);
      const result = await realModule.tryObjectUrl(
        { bucket: 'b', path: 'p', isSigned: false, isPublic: true },
        vi.fn(), preload,
      );
      expect(result).toBeNull();
    });

    it('returns null when preload throws', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockBuildObjectUrl.mockReturnValue('https://object.example.com/img');
      const preload = vi.fn().mockRejectedValue(new Error('fail'));
      const result = await realModule.tryObjectUrl(
        { bucket: 'b', path: 'p', isSigned: false, isPublic: true },
        vi.fn(), preload,
      );
      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });
});
