import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/common/atoms/Badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('renders with default variant and size', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('bg-gray-100')
    expect(badge.className).toContain('text-gray-800')
    expect(badge.className).toContain('px-2.5')
  })

  it('renders with success variant', () => {
    const { container } = render(<Badge variant="success">Success</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-800')
  })

  it('renders with warning variant', () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('bg-yellow-100')
  })

  it('renders with error variant', () => {
    const { container } = render(<Badge variant="error">Error</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('bg-red-100')
  })

  it('renders with info variant', () => {
    const { container } = render(<Badge variant="info">Info</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('bg-blue-100')
  })

  it('renders with small size', () => {
    const { container } = render(<Badge size="sm">Small</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('text-xs')
  })

  it('renders with large size', () => {
    const { container } = render(<Badge size="lg">Large</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('text-base')
  })

  it('applies rounded-full when rounded is true', () => {
    const { container } = render(<Badge rounded>Rounded</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('rounded-full')
  })

  it('applies rounded (not rounded-full) by default', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('rounded')
    expect(badge.className).not.toContain('rounded-full')
  })

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Custom</Badge>)
    const badge = container.querySelector('span')!
    expect(badge.className).toContain('custom-class')
  })
})
