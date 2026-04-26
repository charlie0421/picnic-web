import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    return <img {...props} />
  },
}))

import LoadingSpinner from '@/components/ui/LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders without error', () => {
    const { container } = render(<LoadingSpinner />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders the loading image', () => {
    render(<LoadingSpinner />)
    const img = screen.getByAltText('Picnic Loading')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/images/logo.webp')
  })

  it('renders loading text', () => {
    render(<LoadingSpinner />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<LoadingSpinner className="extra-class" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('extra-class')
  })

  it('has min-h-screen for full page layout', () => {
    const { container } = render(<LoadingSpinner />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('min-h-screen')
  })
})
