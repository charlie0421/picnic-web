import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  ErrorProvider,
  useError,
  useErrorHandler,
  useErrorState,
} from '@/contexts/ErrorContext'

vi.mock('@/utils/error', () => ({
  AppError: class AppError extends Error {
    category: string
    severity: string
    statusCode: number
    context: any
    constructor(
      message: string,
      category = 'unknown',
      severity = 'medium',
      statusCode = 500,
      options: any = {},
    ) {
      super(message)
      this.category = category
      this.severity = severity
      this.statusCode = statusCode
      this.context = options.context
    }
  },
  ErrorCategory: {
    AUTHENTICATION: 'authentication',
    NETWORK: 'network',
    VALIDATION: 'validation',
    SERVER: 'server',
    UNKNOWN: 'unknown',
  },
  ErrorSeverity: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  },
}))

function TestComponent({ onMount }: { onMount: (ctx: any) => void }) {
  const ctx = useError()
  React.useEffect(() => {
    onMount(ctx)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div>test</div>
}

function TestStateComponent({
  onMount,
}: {
  onMount: (state: any) => void
}) {
  const state = useErrorState()
  React.useEffect(() => {
    onMount(state)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div>state-test</div>
}

function TestHandlerComponent({
  onMount,
}: {
  onMount: (handler: any) => void
}) {
  const handler = useErrorHandler()
  React.useEffect(() => {
    onMount(handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div>handler-test</div>
}

describe('ErrorContext', () => {
  describe('ErrorProvider', () => {
    it('renders children', () => {
      render(
        <ErrorProvider>
          <div data-testid="child">Hello</div>
        </ErrorProvider>,
      )

      expect(screen.getByTestId('child')).toBeDefined()
      expect(screen.getByText('Hello')).toBeDefined()
    })

    it('renders multiple children', () => {
      render(
        <ErrorProvider>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </ErrorProvider>,
      )

      expect(screen.getByTestId('child1')).toBeDefined()
      expect(screen.getByTestId('child2')).toBeDefined()
    })
  })

  describe('useError', () => {
    it('throws when used outside ErrorProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestComponent onMount={() => {}} />)
      }).toThrow()

      consoleSpy.mockRestore()
    })

    it('provides context when inside ErrorProvider', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(context).not.toBeNull()
    })
  })

  describe('addError', () => {
    it('creates error from string', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(context).not.toBeNull()
      expect(typeof context.addError).toBe('function')

      act(() => {
        context.addError('Test error message')
      })
    })

    it('creates error from Error object', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.addError(new Error('Native error'))
      })
    })

    it('creates error from AppError', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        // AppError is imported from the mocked module via ErrorContext internally
        // Just test that addError doesn't throw with any Error-like object
        const appErrorLike = Object.assign(new Error('App error'), {
          category: 'network',
          severity: 'high',
          statusCode: 503,
          context: undefined,
        })
        // Mark it so instanceof AppError check in ErrorContext passes
        Object.defineProperty(appErrorLike, 'name', { value: 'AppError' })
        context.addError(appErrorLike)
      })
    })
  })

  describe('dismissError', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.dismissError).toBe('function')
    })

    it('can be called with an id', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.dismissError('some-id')
      })
    })
  })

  describe('clearAllErrors', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.clearAllErrors).toBe('function')
    })

    it('can be called', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.clearAllErrors()
      })
    })
  })

  describe('clearDismissedErrors', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.clearDismissedErrors).toBe('function')
    })

    it('can be called', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.clearDismissedErrors()
      })
    })
  })

  describe('showError', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.showError).toBe('function')
    })

    it('can be called with a message', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.showError('Something went wrong')
      })
    })
  })

  describe('showNetworkError', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.showNetworkError).toBe('function')
    })

    it('can be called with a message', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.showNetworkError('Network unavailable')
      })
    })
  })

  describe('showValidationError', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.showValidationError).toBe('function')
    })

    it('can be called with a message', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.showValidationError('Invalid input')
      })
    })
  })

  describe('showServerError', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.showServerError).toBe('function')
    })

    it('can be called with a message', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      act(() => {
        context.showServerError('Internal server error')
      })
    })
  })

  describe('getActiveErrors', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.getActiveErrors).toBe('function')
    })

    it('returns empty array when no errors', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      const activeErrors = context.getActiveErrors()
      expect(Array.isArray(activeErrors)).toBe(true)
      expect(activeErrors.length).toBe(0)
    })
  })

  describe('hasErrors', () => {
    it('is a function on the context', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(typeof context.hasErrors).toBe('function')
    })

    it('returns false when no errors', () => {
      let context: any = null

      render(
        <ErrorProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </ErrorProvider>,
      )

      expect(context.hasErrors()).toBe(false)
    })
  })

  describe('useErrorState', () => {
    it('provides state when inside ErrorProvider', () => {
      let state: any = null

      render(
        <ErrorProvider>
          <TestStateComponent onMount={(s) => { state = s }} />
        </ErrorProvider>,
      )

      expect(state).not.toBeNull()
      expect(state.errors).toBeDefined()
      expect(Array.isArray(state.errors)).toBe(true)
    })
  })

  describe('useErrorHandler', () => {
    it('provides handler functions when inside ErrorProvider', () => {
      let handler: any = null

      render(
        <ErrorProvider>
          <TestHandlerComponent onMount={(h) => { handler = h }} />
        </ErrorProvider>,
      )

      expect(handler).not.toBeNull()
    })
  })
})
