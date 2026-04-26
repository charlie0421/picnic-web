import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '@/components/common/molecules/Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Card className="my-card">Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('my-card')
  })

  it('has border by default', () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('border')
  })

  it('removes border when bordered is false', () => {
    const { container } = render(<Card bordered={false}>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).not.toContain('border-gray-200')
  })

  it('applies hover styles when hoverable is true', () => {
    const { container } = render(<Card hoverable>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('hover:shadow-lg')
    expect(card.className).toContain('cursor-pointer')
  })

  it('does not apply hover styles by default', () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).not.toContain('hover:shadow-lg')
  })
})

describe('Card.Header', () => {
  it('renders children', () => {
    render(
      <Card>
        <Card.Header>Header text</Card.Header>
      </Card>
    )
    expect(screen.getByText('Header text')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <Card>
        <Card.Header className="custom-header">Header</Card.Header>
      </Card>
    )
    expect(screen.getByText('Header').className).toContain('custom-header')
  })
})

describe('Card.Body', () => {
  it('renders children', () => {
    render(
      <Card>
        <Card.Body>Body text</Card.Body>
      </Card>
    )
    expect(screen.getByText('Body text')).toBeInTheDocument()
  })
})

describe('Card.Footer', () => {
  it('renders children', () => {
    render(
      <Card>
        <Card.Footer>Footer text</Card.Footer>
      </Card>
    )
    expect(screen.getByText('Footer text')).toBeInTheDocument()
  })

  it('has border-top and background', () => {
    render(
      <Card>
        <Card.Footer>Footer</Card.Footer>
      </Card>
    )
    const footer = screen.getByText('Footer')
    expect(footer.className).toContain('border-t')
    expect(footer.className).toContain('bg-gray-50')
  })
})
