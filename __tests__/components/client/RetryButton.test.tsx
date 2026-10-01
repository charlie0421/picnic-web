import { describe, it, expect, vi, beforeEach } from 'vitest'
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
const mockUsePathname = vi.fn(() => '/ko/vote/295')
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ lang: 'ko' }),
}))

// useLocaleRouter 는 실제 구현을 쓴다(언어 경로 계산이 검증 대상이다). 언어 변경에서만 쓰는 Supabase 클라이언트는 막는다.
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: vi.fn(),
}))

import { RetryButton } from '@/components/client/RetryButton'

describe('RetryButton', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockUsePathname.mockReturnValue('/ko/vote/295')
  })

  it('renders button with translated text', () => {
    render(<RetryButton />)
    expect(screen.getByRole('button', { name: '로그인으로 돌아가기' })).toBeInTheDocument()
  })

  // 접두어 없는 /login 으로 가면 middleware 의 307 을 한 번 더 거친다. 보던 언어의 주소로 바로 간다.
  it('보던 언어의 로그인 페이지로 이동한다', () => {
    render(<RetryButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/ko/login')
  })

  it('zh-cn 처럼 지역이 붙은 언어에서도 그 언어의 주소로 이동한다', () => {
    mockUsePathname.mockReturnValue('/zh-cn/media')
    render(<RetryButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/zh-cn/login')
  })

  it('redirectPath 를 주면 그 경로의 언어판으로 이동한다', () => {
    render(<RetryButton redirectPath="/custom-path" />)
    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/ko/custom-path')
  })
})
