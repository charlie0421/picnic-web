import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock languageStore
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'return_to_login': '로그인으로 돌아가기',
      }
      return translations[key] || key
    },
  }),
}))

// Capture the mocked router push fn
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/ko',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: 'ko' }),
}))

import { RetryButton } from '@/components/client/RetryButton'

describe('RetryButton', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders button with translated text', () => {
    render(<RetryButton />)
    expect(screen.getByRole('button', { name: '로그인으로 돌아가기' })).toBeInTheDocument()
  })

  it('navigates to /login by default on click', () => {
    render(<RetryButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('navigates to custom redirectPath on click', () => {
    render(<RetryButton redirectPath="/custom-path" />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/custom-path')
  })
})
