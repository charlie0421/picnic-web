import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    return <img {...props} />
  },
}))

// Mock languageStore
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'error.description': '오류가 발생했습니다',
        'error.retryButton': '다시 시도',
        'notFound.title': '페이지를 찾을 수 없습니다',
        'notFound.description': '요청하신 페이지가 존재하지 않습니다',
        'notFound.homeButton': '홈으로 돌아가기',
      }
      return translations[key] || key
    },
  }),
}))

import ErrorState from '@/components/server/ErrorState'
import LoadingState from '@/components/server/LoadingState'
import NotFoundState from '@/components/server/NotFoundState'

describe('ErrorState', () => {
  it('renders with default error message', () => {
    render(<ErrorState />)
    expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument()
  })

  it('renders with custom error message', () => {
    render(<ErrorState message="Custom error" />)
    expect(screen.getByText('Custom error')).toBeInTheDocument()
  })

  it('renders error code', () => {
    render(<ErrorState code={404} />)
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('renders default 500 code', () => {
    render(<ErrorState />)
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('renders retry link when retryLink is provided', () => {
    render(<ErrorState retryLink="/home" />)
    const link = screen.getByText('다시 시도')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/home')
  })

  it('does not render retry link when retryLink is not provided', () => {
    render(<ErrorState />)
    expect(screen.queryByText('다시 시도')).not.toBeInTheDocument()
  })

  it('renders custom retry label', () => {
    render(<ErrorState retryLink="/home" retryLabel="Go back" />)
    expect(screen.getByText('Go back')).toBeInTheDocument()
  })
})

describe('LoadingState', () => {
  it('renders without error', () => {
    const { container } = render(<LoadingState />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders loading image', () => {
    render(<LoadingState />)
    expect(screen.getByAltText('Picnic Loading')).toBeInTheDocument()
  })

  it('renders message when provided', () => {
    render(<LoadingState message="Loading data..." />)
    expect(screen.getByText('Loading data...')).toBeInTheDocument()
  })

  it('does not render message when not provided', () => {
    const { container } = render(<LoadingState />)
    // Should only have the image, no text message
    expect(container.querySelectorAll('.text-gray-600').length).toBe(0)
  })

  it('renders fullPage variant with min-h-screen', () => {
    const { container } = render(<LoadingState fullPage />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('min-h-screen')
  })

  it('renders partial loading without min-h-screen', () => {
    const { container } = render(<LoadingState />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).not.toContain('min-h-screen')
  })
})

describe('NotFoundState', () => {
  it('renders with default title', () => {
    render(<NotFoundState />)
    expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
  })

  it('renders with default description', () => {
    render(<NotFoundState />)
    expect(screen.getByText('요청하신 페이지가 존재하지 않습니다')).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<NotFoundState title="Custom Not Found" />)
    expect(screen.getByText('Custom Not Found')).toBeInTheDocument()
  })

  it('renders with custom message', () => {
    render(<NotFoundState message="Item was deleted" />)
    expect(screen.getByText('Item was deleted')).toBeInTheDocument()
  })

  it('renders back link with default href "/"', () => {
    render(<NotFoundState />)
    const link = screen.getByText('홈으로 돌아가기')
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders back link with custom href', () => {
    render(<NotFoundState backLink="/dashboard" />)
    const link = screen.getByText('홈으로 돌아가기')
    expect(link.closest('a')).toHaveAttribute('href', '/dashboard')
  })

  it('renders custom back label', () => {
    render(<NotFoundState backLabel="Return to list" />)
    expect(screen.getByText('Return to list')).toBeInTheDocument()
  })
})
