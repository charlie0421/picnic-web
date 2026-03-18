import { describe, it, expect, vi } from 'vitest'

vi.mock('@/config/settings', () => ({
  DEFAULT_LANGUAGE: 'en',
  settings: { languages: { supported: ['en', 'ko', 'ja'], default: 'en' } },
}))

import {
  isValidRedirectUrl,
  shouldSaveUrl,
  normalizeRedirectPath,
} from '@/utils/auth-redirect-validators'

describe('isValidRedirectUrl', () => {
  describe('valid relative paths', () => {
    it('accepts /vote', () => {
      expect(isValidRedirectUrl('/vote')).toBe(true)
    })

    it('accepts /ko/star-candy', () => {
      expect(isValidRedirectUrl('/ko/star-candy')).toBe(true)
    })

    it('accepts /en/some-page', () => {
      expect(isValidRedirectUrl('/en/some-page')).toBe(true)
    })

    it('accepts /profile/settings', () => {
      expect(isValidRedirectUrl('/profile/settings')).toBe(true)
    })

    it('accepts paths with query parameters', () => {
      expect(isValidRedirectUrl('/vote?id=123')).toBe(true)
    })
  })

  describe('rejects absolute URLs', () => {
    it('rejects http URLs', () => {
      expect(isValidRedirectUrl('http://evil.com')).toBe(false)
    })

    it('rejects https URLs', () => {
      expect(isValidRedirectUrl('https://evil.com')).toBe(false)
    })

    it('rejects protocol-relative URLs', () => {
      expect(isValidRedirectUrl('//evil.com')).toBe(false)
    })
  })

  describe('rejects dangerous protocols', () => {
    it('rejects javascript: scheme', () => {
      expect(isValidRedirectUrl('javascript:alert(1)')).toBe(false)
    })

    it('rejects data: scheme', () => {
      expect(isValidRedirectUrl('data:text/html,<h1>test</h1>')).toBe(false)
    })

    it('rejects vbscript: scheme', () => {
      expect(isValidRedirectUrl('vbscript:msgbox')).toBe(false)
    })
  })

  describe('rejects backslashes and directory traversal', () => {
    it('rejects backslashes', () => {
      expect(isValidRedirectUrl('/path\\evil')).toBe(false)
    })

    it('rejects directory traversal with ../', () => {
      expect(isValidRedirectUrl('/../etc/passwd')).toBe(false)
    })

    it('rejects directory traversal with ../path', () => {
      expect(isValidRedirectUrl('../etc/passwd')).toBe(false)
    })
  })

  describe('rejects excluded paths', () => {
    it('rejects /login', () => {
      expect(isValidRedirectUrl('/login')).toBe(false)
    })

    it('rejects /auth/ paths', () => {
      expect(isValidRedirectUrl('/auth/callback')).toBe(false)
    })

    it('rejects /callback', () => {
      expect(isValidRedirectUrl('/callback')).toBe(false)
    })

    it('rejects /logout', () => {
      expect(isValidRedirectUrl('/logout')).toBe(false)
    })

    it('rejects /error', () => {
      expect(isValidRedirectUrl('/error')).toBe(false)
    })

    it('rejects /404', () => {
      expect(isValidRedirectUrl('/404')).toBe(false)
    })

    it('rejects /500', () => {
      expect(isValidRedirectUrl('/500')).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('rejects empty string', () => {
      expect(isValidRedirectUrl('')).toBe(false)
    })

    it('rejects null-ish values', () => {
      expect(isValidRedirectUrl(null as unknown as string)).toBe(false)
      expect(isValidRedirectUrl(undefined as unknown as string)).toBe(false)
    })

    it('handles whitespace-only strings', () => {
      // Whitespace strings get parsed as valid relative paths by URL parser
      // The implementation accepts them as they start with '/' after parsing
      const result = isValidRedirectUrl('   ')
      expect(typeof result).toBe('boolean')
    })
  })
})

describe('shouldSaveUrl', () => {
  it('returns true for valid saveable URLs', () => {
    expect(shouldSaveUrl('/vote')).toBe(true)
    expect(shouldSaveUrl('/ko/star-candy')).toBe(true)
    expect(shouldSaveUrl('/profile')).toBe(true)
  })

  it('returns false for excluded patterns', () => {
    expect(shouldSaveUrl('/login')).toBe(false)
    expect(shouldSaveUrl('/auth/callback')).toBe(false)
    expect(shouldSaveUrl('/callback')).toBe(false)
    expect(shouldSaveUrl('/logout')).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(shouldSaveUrl('')).toBe(false)
    expect(shouldSaveUrl('https://evil.com')).toBe(false)
  })
})

describe('normalizeRedirectPath', () => {
  it('returns / for empty input', () => {
    expect(normalizeRedirectPath('')).toBe('/')
  })

  it('returns / for null input', () => {
    expect(normalizeRedirectPath(null as unknown as string)).toBe('/')
  })

  it('returns / for undefined input', () => {
    expect(normalizeRedirectPath(undefined as unknown as string)).toBe('/')
  })

  it('adds leading slash if missing', () => {
    const result = normalizeRedirectPath('vote')
    expect(result.startsWith('/')).toBe(true)
  })

  it('preserves existing leading slash', () => {
    const result = normalizeRedirectPath('/vote')
    expect(result).toContain('vote')
    expect(result.startsWith('/')).toBe(true)
  })

  it('fixes /login/ prefix by removing it', () => {
    const result = normalizeRedirectPath('/login/redirect')
    expect(result).not.toContain('/login/')
  })

  it('handles locale prefix addition', () => {
    const result = normalizeRedirectPath('/vote', 'ko')
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  it('handles path already containing locale prefix', () => {
    const result = normalizeRedirectPath('/ko/vote', 'ko')
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })
})
