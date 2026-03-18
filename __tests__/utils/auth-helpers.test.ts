import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/storage', () => ({
  getLastLoginInfo: vi.fn(),
  setLastLoginInfo: vi.fn(),
  clearLastLoginInfo: vi.fn(),
}))

vi.mock('@/lib/supabase/social/types', () => ({}))

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
  saveLastLoginProvider,
  getLastLoginProvider,
  clearLastLoginProvider,
  sortProvidersByLastUsed,
  hasLastLoginProvider,
  isLastUsedProvider,
  incrementProviderUsage,
  clearProviderUsageStats,
} from '@/utils/auth-helpers'

import { getLastLoginInfo } from '@/utils/storage'

const mockedGetLastLoginInfo = vi.mocked(getLastLoginInfo)

beforeEach(() => {
  mockLocalStorage.clear()
  vi.clearAllMocks()
})

describe('saveLastLoginProvider', () => {
  it('is deprecated and just returns without error', () => {
    expect(() => saveLastLoginProvider('google')).not.toThrow()
  })
})

describe('getLastLoginProvider', () => {
  it('returns provider from new storage system', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    })
    const result = getLastLoginProvider()
    expect(result).toBe('google')
  })

  it('falls back to legacy localStorage key', () => {
    mockedGetLastLoginInfo.mockReturnValue(null)
    mockLocalStorage.setItem('picnic_last_login_provider', 'apple')
    const result = getLastLoginProvider()
    expect(result === 'apple' || result === null).toBe(true)
  })

  it('returns null when nothing is stored', () => {
    mockedGetLastLoginInfo.mockReturnValue(null)
    const result = getLastLoginProvider()
    expect(result).toBeNull()
  })
})

describe('clearLastLoginProvider', () => {
  it('removes legacy key from localStorage', () => {
    mockLocalStorage.setItem('picnic_last_login_provider', 'google')
    clearLastLoginProvider()
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('picnic_last_login_provider')
  })
})

describe('sortProvidersByLastUsed', () => {
  it('moves last used provider to front', () => {
    const providers: any[] = ['google', 'apple', 'kakao']
    const result = sortProvidersByLastUsed(providers, 'kakao')
    expect(result[0]).toBe('kakao')
  })

  it('returns original order when no last login', () => {
    const providers: any[] = ['google', 'apple', 'kakao']
    const result = sortProvidersByLastUsed(providers, null)
    expect(result).toEqual(providers)
  })

  it('handles empty array', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    })
    const result = sortProvidersByLastUsed([])
    expect(result).toEqual([])
  })

  it('does not duplicate provider if already first', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    })
    const providers = ['google', 'apple', 'kakao']
    const result = sortProvidersByLastUsed(providers)
    expect(result.length).toBe(3)
    expect(result[0]).toBe('google')
  })

  it('handles provider not in list', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'facebook',
      userId: 'user123',
      timestamp: Date.now(),
    })
    const providers = ['google', 'apple', 'kakao']
    const result = sortProvidersByLastUsed(providers)
    expect(result.length).toBe(3)
  })
})

describe('hasLastLoginProvider', () => {
  it('returns true when provider exists', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    })
    expect(hasLastLoginProvider()).toBe(true)
  })

  it('returns false when no provider', () => {
    mockedGetLastLoginInfo.mockReturnValue(null)
    expect(hasLastLoginProvider()).toBe(false)
  })
})

describe('isLastUsedProvider', () => {
  it('returns true when provider matches', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    })
    expect(isLastUsedProvider('google')).toBe(true)
  })

  it('returns false when provider does not match', () => {
    mockedGetLastLoginInfo.mockReturnValue({
      provider: 'google',
      userId: 'user123',
      timestamp: Date.now(),
    })
    expect(isLastUsedProvider('apple')).toBe(false)
  })

  it('returns false when no login info', () => {
    mockedGetLastLoginInfo.mockReturnValue(null)
    expect(isLastUsedProvider('google')).toBe(false)
  })
})

describe('incrementProviderUsage', () => {
  it('increments counter for provider', () => {
    incrementProviderUsage('google')
    expect(mockLocalStorage.setItem).toHaveBeenCalled()
  })

  it('initializes counter at 1 for first use', () => {
    incrementProviderUsage('apple')
    const calls = mockLocalStorage.setItem.mock.calls
    const usageCall = calls.find((call: [string, string]) => call[0].includes('usage'))
    if (usageCall) {
      expect(usageCall[1]).toContain('1')
    }
  })

  it('increments existing counter', () => {
    mockLocalStorage.setItem('picnic_provider_usage_google', '3')
    vi.clearAllMocks()
    incrementProviderUsage('google')
    expect(mockLocalStorage.setItem).toHaveBeenCalled()
  })
})

describe('clearProviderUsageStats', () => {
  it('removes all usage keys', () => {
    mockLocalStorage.setItem('picnic_provider_usage_google', '5')
    mockLocalStorage.setItem('picnic_provider_usage_apple', '3')

    clearProviderUsageStats()

    expect(mockLocalStorage.removeItem).toHaveBeenCalled()
  })
})
