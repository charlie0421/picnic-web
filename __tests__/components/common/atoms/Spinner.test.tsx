import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from '@/components/common/atoms/Spinner'

// Mock next/image since it requires Next.js runtime
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

describe('Spinner', () => {
  it('renders without error', () => {
    const { container } = render(<Spinner />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders an image with alt text "Loading"', () => {
    render(<Spinner />)
    expect(screen.getByAltText('Loading')).toBeInTheDocument()
  })

  it('renders with default medium size', () => {
    render(<Spinner />)
    const img = screen.getByAltText('Loading')
    expect(img).toHaveAttribute('width', '32')
    expect(img).toHaveAttribute('height', '32')
  })

  it('renders with small size', () => {
    render(<Spinner size="sm" />)
    const img = screen.getByAltText('Loading')
    expect(img).toHaveAttribute('width', '16')
    expect(img).toHaveAttribute('height', '16')
  })

  it('renders with large size', () => {
    render(<Spinner size="lg" />)
    const img = screen.getByAltText('Loading')
    expect(img).toHaveAttribute('width', '48')
    expect(img).toHaveAttribute('height', '48')
  })

  it('renders with xl size', () => {
    render(<Spinner size="xl" />)
    const img = screen.getByAltText('Loading')
    expect(img).toHaveAttribute('width', '64')
    expect(img).toHaveAttribute('height', '64')
  })

  it('applies custom className', () => {
    const { container } = render(<Spinner className="my-spinner" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('my-spinner')
  })
})
