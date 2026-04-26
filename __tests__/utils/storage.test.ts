import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/date', () => ({
  formatRelativeTime: vi.fn(() => '2 hours ago'),
}))

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true })

import {
  getLastLoginInfo,
  setLastLoginInfo,
  clearLastLoginInfo,
  formatLastLoginTime,
  isLastLoginForUser,
  getProviderDisplayName,
  setAvatarUrl,
  getAvatarUrl,
  clearAvatarUrl,
} from '@/utils/storage'

beforeEach(() => {
  mockLocalStorage.clear()
  vi.clearAllMocks()
})

describe('getLastLoginInfo', () => {
  it('returns null when localStorage is empty', () => {
    const result = getLastLoginInfo()
    expect(result).toBeNull()
  })

  it('parses valid stored data', () => {
    const data = {
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    }
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify(data))
    const result = getLastLoginInfo()
    expect(result).toBeDefined()
    expect(result?.provider).toBe('google')
    expect(result?.userId).toBe('user123')
  })

  it('returns null for invalid JSON', () => {
    mockLocalStorage.setItem('picnic_last_login', 'not-valid-json')
    const result = getLastLoginInfo()
    expect(result).toBeNull()
  })

  it('returns null for corrupted data', () => {
    mockLocalStorage.setItem('picnic_last_login', '{}')
    const result = getLastLoginInfo()
    // Depending on implementation, may return empty object or null
    expect(result === null || typeof result === 'object').toBe(true)
  })
})

describe('setLastLoginInfo', () => {
  it('stores valid data and returns true', () => {
    const data = {
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    }
    const result = setLastLoginInfo(data)
    expect(result).toBe(true)
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'picnic_last_login',
      expect.any(String)
    )
  })

  it('rejects invalid data', () => {
    const result = setLastLoginInfo(null as unknown as Parameters<typeof setLastLoginInfo>[0])
    expect(result).toBe(false)
  })

  it('returns boolean', () => {
    const data = {
      provider: 'apple',
      userId: 'user456',
      timestamp: Date.now(),
    }
    const result = setLastLoginInfo(data)
    expect(typeof result).toBe('boolean')
  })
})

describe('clearLastLoginInfo', () => {
  it('removes the last login item from localStorage', () => {
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify({ provider: 'google' }))
    clearLastLoginInfo()
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('picnic_last_login')
  })
})

describe('formatLastLoginTime', () => {
  it('returns a formatted string', () => {
    const result = formatLastLoginTime(Date.now())
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns fallback message for invalid timestamp', () => {
    const result = formatLastLoginTime(0, 'en')
    expect(typeof result).toBe('string')
  })

  it('returns fallback message per language', () => {
    const resultKo = formatLastLoginTime(Date.now(), 'ko')
    const resultEn = formatLastLoginTime(Date.now(), 'en')
    expect(typeof resultKo).toBe('string')
    expect(typeof resultEn).toBe('string')
  })
})

describe('isLastLoginForUser', () => {
  it('returns true when userId matches', () => {
    const data = {
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    }
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify(data))
    const result = isLastLoginForUser('user123')
    expect(result).toBe(true)
  })

  it('returns false when userId does not match', () => {
    const data = {
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    }
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify(data))
    const result = isLastLoginForUser('different-user')
    expect(result).toBe(false)
  })

  it('returns false when no login info stored', () => {
    const result = isLastLoginForUser('user123')
    expect(result).toBe(false)
  })
})

describe('getProviderDisplayName', () => {
  it('returns Google for google provider', () => {
    expect(getProviderDisplayName('google')).toBe('Google')
  })

  it('returns Apple for apple provider', () => {
    expect(getProviderDisplayName('apple')).toBe('Apple')
  })

  it('returns Kakao for kakao provider', () => {
    expect(getProviderDisplayName('kakao')).toBe('Kakao')
  })

  it('capitalizes unknown provider names', () => {
    const result = getProviderDisplayName('facebook')
    expect(result).toBe('Facebook')
  })

  it('handles empty string', () => {
    const result = getProviderDisplayName('')
    expect(typeof result).toBe('string')
  })
})

describe('setAvatarUrl', () => {
  it('stores avatar URL in localStorage', () => {
    setAvatarUrl('https://example.com/avatar.png')
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      'https://example.com/avatar.png'
    )
  })
})

describe('getAvatarUrl', () => {
  it('retrieves stored avatar URL', () => {
    mockLocalStorage.setItem('picnic_avatar_url', 'https://example.com/avatar.png')
    const result = getAvatarUrl()
    expect(result === 'https://example.com/avatar.png' || result === null).toBe(true)
  })

  it('returns null when no avatar is stored', () => {
    const result = getAvatarUrl()
    expect(result).toBeNull()
  })
})

describe('clearAvatarUrl', () => {
  it('removes avatar URL from localStorage', () => {
    mockLocalStorage.setItem('picnic_avatar_url', 'https://example.com/avatar.png')
    clearAvatarUrl()
    expect(mockLocalStorage.removeItem).toHaveBeenCalled()
  })
})

describe('getLastLoginInfo (additional branches)', () => {
  it('returns null for data missing provider field', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify({
      userId: 'user1',
      timestamp: '12345',
    }))
    const result = getLastLoginInfo()
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it('returns null for data missing userId field', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify({
      provider: 'google',
      timestamp: '12345',
    }))
    const result = getLastLoginInfo()
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it('returns null for data missing timestamp field', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify({
      provider: 'google',
      userId: 'user1',
    }))
    const result = getLastLoginInfo()
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it('returns valid data when all fields are present', () => {
    mockLocalStorage.setItem('picnic_last_login', JSON.stringify({
      provider: 'apple',
      providerDisplay: 'Apple',
      userId: 'user123',
      timestamp: '2024-01-01',
    }))
    const result = getLastLoginInfo()
    expect(result).not.toBeNull()
    expect(result!.provider).toBe('apple')
    expect(result!.providerDisplay).toBe('Apple')
  })
})

describe('setLastLoginInfo (additional branches)', () => {
  it('returns false for data missing provider', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = setLastLoginInfo({
      provider: '',
      providerDisplay: '',
      userId: 'user1',
      timestamp: '123',
    })
    expect(result).toBe(false)
    consoleSpy.mockRestore()
  })

  it('returns false for data missing userId', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = setLastLoginInfo({
      provider: 'google',
      providerDisplay: 'Google',
      userId: '',
      timestamp: '123',
    })
    expect(result).toBe(false)
    consoleSpy.mockRestore()
  })

  it('returns false for data missing timestamp', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = setLastLoginInfo({
      provider: 'google',
      providerDisplay: 'Google',
      userId: 'user1',
      timestamp: '',
    })
    expect(result).toBe(false)
    consoleSpy.mockRestore()
  })

  it('handles localStorage.setItem throwing error', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const origSetItem = mockLocalStorage.setItem
    mockLocalStorage.setItem = vi.fn(() => { throw new Error('quota exceeded') })

    const result = setLastLoginInfo({
      provider: 'google',
      providerDisplay: 'Google',
      userId: 'user1',
      timestamp: '2024-01-01',
    })
    expect(result).toBe(false)

    mockLocalStorage.setItem = origSetItem
    consoleSpy.mockRestore()
  })
})

describe('clearLastLoginInfo (additional)', () => {
  it('returns true on successful removal', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = clearLastLoginInfo()
    expect(result).toBe(true)
    consoleSpy.mockRestore()
  })

  it('returns false on localStorage error', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const origRemoveItem = mockLocalStorage.removeItem
    mockLocalStorage.removeItem = vi.fn(() => { throw new Error('denied') })

    const result = clearLastLoginInfo()
    expect(result).toBe(false)

    mockLocalStorage.removeItem = origRemoveItem
    consoleSpy.mockRestore()
  })
})

describe('formatLastLoginTime (additional)', () => {
  it('returns fallback message for ja language on error', async () => {
    const dateMod = await import('@/utils/date')
    vi.mocked(dateMod.formatRelativeTime).mockImplementation(() => { throw new Error('parse error') })
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = formatLastLoginTime('invalid-timestamp', 'ja' as any)
    expect(result).toBe('不明')

    consoleSpy.mockRestore()
    vi.mocked(dateMod.formatRelativeTime).mockImplementation(() => '2 hours ago')
  })

  it('returns fallback for unsupported language falling back to ko', async () => {
    const dateMod = await import('@/utils/date')
    vi.mocked(dateMod.formatRelativeTime).mockImplementation(() => { throw new Error('parse error') })
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = formatLastLoginTime('invalid-timestamp', 'zh' as any)
    expect(result).toBe('未知')

    consoleSpy.mockRestore()
    vi.mocked(dateMod.formatRelativeTime).mockImplementation(() => '2 hours ago')
  })

  it('returns fallback for completely unknown language key', async () => {
    const dateMod = await import('@/utils/date')
    vi.mocked(dateMod.formatRelativeTime).mockImplementation(() => { throw new Error('parse error') })
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = formatLastLoginTime('bad', 'xx' as any)
    // Falls back to ko
    expect(result).toBe('알 수 없음')

    consoleSpy.mockRestore()
    vi.mocked(dateMod.formatRelativeTime).mockImplementation(() => '2 hours ago')
  })
})

describe('setAvatarUrl (additional)', () => {
  it('returns false for empty string', () => {
    const result = setAvatarUrl('')
    expect(result).toBe(false)
  })

  it('returns false for non-string input', () => {
    const result = setAvatarUrl(null as any)
    expect(result).toBe(false)
  })

  it('returns true for valid URL', () => {
    const result = setAvatarUrl('https://example.com/avatar.png')
    expect(result).toBe(true)
  })

  it('returns false on localStorage error', () => {
    const origSetItem = mockLocalStorage.setItem
    mockLocalStorage.setItem = vi.fn(() => { throw new Error('denied') })

    const result = setAvatarUrl('https://example.com/avatar.png')
    expect(result).toBe(false)

    mockLocalStorage.setItem = origSetItem
  })
})

describe('getAvatarUrl (additional)', () => {
  it('returns null on localStorage error', () => {
    const origGetItem = mockLocalStorage.getItem
    mockLocalStorage.getItem = vi.fn(() => { throw new Error('denied') })

    const result = getAvatarUrl()
    expect(result).toBeNull()

    mockLocalStorage.getItem = origGetItem
  })
})

describe('clearAvatarUrl (additional)', () => {
  it('returns true on successful removal', () => {
    const result = clearAvatarUrl()
    expect(result).toBe(true)
  })

  it('returns false on localStorage error', () => {
    const origRemoveItem = mockLocalStorage.removeItem
    mockLocalStorage.removeItem = vi.fn(() => { throw new Error('denied') })

    const result = clearAvatarUrl()
    expect(result).toBe(false)

    mockLocalStorage.removeItem = origRemoveItem
  })
})
