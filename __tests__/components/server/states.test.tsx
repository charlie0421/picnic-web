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

import LoadingState from '@/components/server/LoadingState'

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
