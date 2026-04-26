import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  GlobalLoadingProvider,
  useGlobalLoading,
} from '@/contexts/GlobalLoadingContext'

// Mock next/navigation
const mockPathname = vi.fn().mockReturnValue('/home')
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

function TestComponent({ onMount }: { onMount: (ctx: any) => void }) {
  const ctx = useGlobalLoading()
  React.useEffect(() => {
    onMount(ctx)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div>loading-test</div>
}

function DisplayComponent() {
  const { isLoading } = useGlobalLoading()
  return <span data-testid="loading">{isLoading ? 'loading' : 'idle'}</span>
}

function ControlComponent() {
  const { forceStopLoading } = useGlobalLoading()
  return (
    <button data-testid="stop-loading" onClick={forceStopLoading}>
      Stop Loading
    </button>
  )
}

describe('GlobalLoadingContext', () => {
  describe('GlobalLoadingProvider', () => {
    it('renders children', () => {
      render(
        <GlobalLoadingProvider>
          <div data-testid="child">Hello</div>
        </GlobalLoadingProvider>,
      )

      expect(screen.getByTestId('child')).toBeDefined()
      expect(screen.getByText('Hello')).toBeDefined()
    })

    it('renders multiple children', () => {
      render(
        <GlobalLoadingProvider>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </GlobalLoadingProvider>,
      )

      expect(screen.getByTestId('child1')).toBeDefined()
      expect(screen.getByTestId('child2')).toBeDefined()
    })
  })

  describe('useGlobalLoading', () => {
    it('throws when used outside GlobalLoadingProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestComponent onMount={() => {}} />)
      }).toThrow()

      consoleSpy.mockRestore()
    })

    it('provides context when inside GlobalLoadingProvider', () => {
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </GlobalLoadingProvider>,
      )

      expect(context).not.toBeNull()
    })
  })

  describe('isLoading', () => {
    it('defaults to false', () => {
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </GlobalLoadingProvider>,
      )

      expect(context.isLoading).toBe(false)
    })

    it('renders idle state by default', () => {
      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      expect(screen.getByTestId('loading').textContent).toBe('idle')
    })
  })

  describe('forceStopLoading', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </GlobalLoadingProvider>,
      )

      expect(typeof context.forceStopLoading).toBe('function')
    })

    it('sets loading to false', () => {
      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
          <ControlComponent />
        </GlobalLoadingProvider>,
      )

      act(() => {
        screen.getByTestId('stop-loading').click()
      })

      expect(screen.getByTestId('loading').textContent).toBe('idle')
    })

    it('can be called multiple times without error', () => {
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </GlobalLoadingProvider>,
      )

      act(() => {
        context.forceStopLoading()
        context.forceStopLoading()
        context.forceStopLoading()
      })

      // Should not throw
      expect(context.isLoading).toBe(false)
    })
  })

  describe('custom events', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      mockPathname.mockReturnValue('/home')
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('starts loading on startGlobalLoading custom event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      act(() => {
        window.dispatchEvent(
          new CustomEvent('startGlobalLoading', { detail: { source: 'test' } }),
        )
      })

      expect(screen.getByTestId('loading').textContent).toBe('loading')
      consoleSpy.mockRestore()
    })

    it('stops loading on stopGlobalLoading custom event', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      act(() => {
        window.dispatchEvent(
          new CustomEvent('startGlobalLoading', { detail: { source: 'test' } }),
        )
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')

      act(() => {
        window.dispatchEvent(
          new CustomEvent('stopGlobalLoading', { detail: { source: 'test' } }),
        )
      })
      expect(screen.getByTestId('loading').textContent).toBe('idle')
      consoleSpy.mockRestore()
    })

    it('handles nested manual loading (counter)', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      // Start twice
      act(() => {
        window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: {} }))
      })
      act(() => {
        window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: {} }))
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')

      // Stop once — still loading (counter = 1)
      act(() => {
        window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: {} }))
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')

      // Stop again — now idle (counter = 0)
      act(() => {
        window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: {} }))
      })
      expect(screen.getByTestId('loading').textContent).toBe('idle')
      consoleSpy.mockRestore()
    })

    it('manualCount does not go below 0', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      // Stop without start should not break anything
      act(() => {
        window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: {} }))
      })
      expect(screen.getByTestId('loading').textContent).toBe('idle')
      consoleSpy.mockRestore()
    })
  })

  describe('setLoadingWithPageBasedRelease (setIsLoading from context)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      mockPathname.mockReturnValue('/home')
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sets loading to true when called with true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      act(() => {
        context.setIsLoading(true)
      })

      expect(screen.getByTestId('loading').textContent).toBe('loading')
      consoleSpy.mockRestore()
    })

    it('sets loading to false when called with false', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      act(() => {
        context.setIsLoading(true)
      })
      act(() => {
        context.setIsLoading(false)
      })

      expect(screen.getByTestId('loading').textContent).toBe('idle')
      consoleSpy.mockRestore()
    })
  })

  describe('pathname change behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-releases loading after timeout on regular page', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      mockPathname.mockReturnValue('/home')
      let context: any = null

      render(
        <GlobalLoadingProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      act(() => {
        context.setIsLoading(true)
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')

      // Advance past the 300ms timeout
      act(() => {
        vi.advanceTimersByTime(350)
      })

      expect(screen.getByTestId('loading').textContent).toBe('idle')
      consoleSpy.mockRestore()
    })

    it('does NOT auto-release loading on callback page', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      mockPathname.mockReturnValue('/auth/callback')

      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      // Start loading via custom event
      act(() => {
        window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: {} }))
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')

      // Advance timer — loading should NOT be released on callback page
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')
      consoleSpy.mockRestore()
    })

    it('does not auto-release if manualCount > 0', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      mockPathname.mockReturnValue('/home')

      render(
        <GlobalLoadingProvider>
          <DisplayComponent />
        </GlobalLoadingProvider>,
      )

      // Start manual loading
      act(() => {
        window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: {} }))
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')

      // Advance past timeout — should still be loading because manualCount > 0
      act(() => {
        vi.advanceTimersByTime(350)
      })
      expect(screen.getByTestId('loading').textContent).toBe('loading')
      consoleSpy.mockRestore()
    })
  })
})
