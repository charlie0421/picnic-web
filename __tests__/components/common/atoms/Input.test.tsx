import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '@/components/common/atoms/Input'

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('handles onChange events', () => {
    const handleChange = vi.fn()
    render(<Input placeholder="Type here" onChange={handleChange} />)
    fireEvent.change(screen.getByPlaceholderText('Type here'), {
      target: { value: 'hello' },
    })
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Input placeholder="Disabled" disabled />)
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled()
  })

  it('renders label when provided', () => {
    render(<Input label="Email" placeholder="email@example.com" />)
    expect(screen.getByText('Email')).toBeInTheDocument()
    // Label should be associated with the input via htmlFor
    const label = screen.getByText('Email')
    const input = screen.getByPlaceholderText('email@example.com')
    expect(label.getAttribute('for')).toBe(input.id)
  })

  it('renders error message when error is provided', () => {
    render(<Input error="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('applies error styles when error is present', () => {
    const { container } = render(<Input error="Error" />)
    const input = container.querySelector('input')!
    expect(input.className).toContain('border-red-500')
  })

  it('renders helper text when provided and no error', () => {
    render(<Input helperText="Enter your full name" />)
    expect(screen.getByText('Enter your full name')).toBeInTheDocument()
  })

  it('does not render helper text when error is present', () => {
    render(<Input helperText="Helper" error="Error" />)
    expect(screen.queryByText('Helper')).not.toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('applies fullWidth class when fullWidth is true', () => {
    const { container } = render(<Input fullWidth />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('w-full')
  })

  it('applies custom className', () => {
    const { container } = render(<Input className="my-input" />)
    const input = container.querySelector('input')!
    expect(input.className).toContain('my-input')
  })

  it('uses provided id', () => {
    render(<Input id="my-input" label="Name" />)
    const input = screen.getByRole('textbox')
    expect(input.id).toBe('my-input')
  })
})
