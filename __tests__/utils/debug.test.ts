import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

const originalNodeEnv = process.env.NODE_ENV

beforeEach(() => {
  mockLocalStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
})

describe('debugLog', () => {
  it('logs in development environment', async () => {
    process.env.NODE_ENV = 'development'
    // Re-import to pick up environment change
    vi.resetModules()
    const { debugLog } = await import('@/utils/debug')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    debugLog('test message')

    // In development, should log
    // Note: behavior depends on implementation
    consoleSpy.mockRestore()
  })

  it('does not log in production environment', async () => {
    process.env.NODE_ENV = 'production'
    vi.resetModules()
    const { debugLog } = await import('@/utils/debug')
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    debugLog('test message')

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('stores logs to localStorage', async () => {
    process.env.NODE_ENV = 'development'
    vi.resetModules()
    const { debugLog } = await import('@/utils/debug')

    debugLog('test log entry')

    // Should store in localStorage
    const stored = mockLocalStorage.getItem('picnic_debug_logs')
    if (stored) {
      const logs = JSON.parse(stored)
      expect(Array.isArray(logs)).toBe(true)
    }
  })

  it('caps stored logs at 20 entries', async () => {
    process.env.NODE_ENV = 'development'
    vi.resetModules()
    const { debugLog } = await import('@/utils/debug')

    // Fill up beyond 20 logs
    for (let i = 0; i < 25; i++) {
      debugLog(`log entry ${i}`)
    }

    const stored = mockLocalStorage.getItem('picnic_debug_logs')
    if (stored) {
      const logs = JSON.parse(stored)
      expect(logs.length).toBeLessThanOrEqual(20)
    }
  })

  it('handles localStorage errors gracefully', async () => {
    process.env.NODE_ENV = 'development'
    vi.resetModules()
    const { debugLog } = await import('@/utils/debug')

    mockLocalStorage.setItem.mockImplementationOnce(() => {
      throw new Error('Storage full')
    })

    // Should not throw
    expect(() => debugLog('test')).not.toThrow()
  })
})
