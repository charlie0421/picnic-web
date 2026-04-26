import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DefaultErrorFallback } from '@/components/common/DefaultErrorFallback'
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error'

// Helper to create a mock AppError
function createMockError(overrides: Partial<{
  message: string
  severity: ErrorSeverity
  isRetryable: boolean
  userMessage: string
}> = {}) {
  const error = new AppError(
    overrides.message || 'Test error',
    ErrorCategory.UNKNOWN,
    overrides.severity ?? ErrorSeverity.MEDIUM,
    500,
  )
  // Override isRetryable if specified
  if (overrides.isRetryable !== undefined) {
    Object.defineProperty(error, 'isRetryable', { value: overrides.isRetryable })
  }
  if (overrides.userMessage) {
    error.toUserMessage = () => overrides.userMessage!
  }
  return error
}

describe('DefaultErrorFallback', () => {
  const defaultProps = {
    retry: vi.fn(),
    retryCount: 0,
    maxRetries: 3,
    isRetrying: false,
  }

  it('renders error message', () => {
    const error = createMockError({ userMessage: 'Something went wrong' })
    render(<DefaultErrorFallback {...defaultProps} error={error} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders heading for page level', () => {
    const error = createMockError()
    render(<DefaultErrorFallback {...defaultProps} error={error} level="page" />)
    expect(screen.getByText('페이지 오류')).toBeInTheDocument()
  })

  it('renders heading for component level', () => {
    const error = createMockError()
    render(<DefaultErrorFallback {...defaultProps} error={error} level="component" />)
    expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument()
  })

  it('shows retry button when error is retryable', () => {
    const error = createMockError({ isRetryable: true })
    render(<DefaultErrorFallback {...defaultProps} error={error} />)
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument()
  })

  it('does not show retry button when error is not retryable', () => {
    const error = createMockError({ isRetryable: false })
    render(<DefaultErrorFallback {...defaultProps} error={error} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls retry function when retry button is clicked', () => {
    const retry = vi.fn()
    const error = createMockError({ isRetryable: true })
    render(<DefaultErrorFallback {...defaultProps} error={error} retry={retry} />)
    fireEvent.click(screen.getByRole('button'))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('shows retrying text when isRetrying is true', () => {
    const error = createMockError({ isRetryable: true })
    render(
      <DefaultErrorFallback {...defaultProps} error={error} isRetrying={true} />
    )
    expect(screen.getByText('재시도 중...')).toBeInTheDocument()
  })

  it('disables retry button when isRetrying', () => {
    const error = createMockError({ isRetryable: true })
    render(
      <DefaultErrorFallback {...defaultProps} error={error} isRetrying={true} />
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows retry count in button text', () => {
    const error = createMockError({ isRetryable: true })
    render(
      <DefaultErrorFallback {...defaultProps} error={error} retryCount={1} maxRetries={3} />
    )
    expect(screen.getByText('다시 시도 (1/3)')).toBeInTheDocument()
  })
})
