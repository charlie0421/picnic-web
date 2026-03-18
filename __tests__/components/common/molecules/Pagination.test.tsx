import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Pagination from '@/components/common/molecules/Pagination'

// Mock @heroicons/react
vi.mock('@heroicons/react/24/outline', () => ({
  ChevronLeftIcon: (props: Record<string, unknown>) => <span data-testid="chevron-left" {...props} />,
  ChevronRightIcon: (props: Record<string, unknown>) => <span data-testid="chevron-right" {...props} />,
}))

describe('Pagination', () => {
  it('renders nothing when totalPages is 1', () => {
    const { container } = render(<Pagination totalPages={1} currentPage={1} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when totalPages is 0', () => {
    const { container } = render(<Pagination totalPages={0} currentPage={1} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders page numbers for small page count', () => {
    render(<Pagination totalPages={3} currentPage={1} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('highlights current page with active styles', () => {
    render(<Pagination totalPages={5} currentPage={3} />)
    const activePage = screen.getByText('3')
    expect(activePage.className).toContain('bg-primary')
    expect(activePage.className).toContain('text-white')
  })

  it('applies inactive styles to non-current pages', () => {
    render(<Pagination totalPages={5} currentPage={3} />)
    const inactivePage = screen.getByText('1')
    expect(inactivePage.className).toContain('bg-white')
    expect(inactivePage.className).toContain('text-gray-700')
  })

  it('renders previous and next navigation arrows', () => {
    render(<Pagination totalPages={5} currentPage={3} />)
    expect(screen.getByTestId('chevron-left')).toBeInTheDocument()
    expect(screen.getByTestId('chevron-right')).toBeInTheDocument()
  })

  it('disables previous button on first page', () => {
    render(<Pagination totalPages={5} currentPage={1} />)
    const prevLink = screen.getByTestId('chevron-left').closest('a')!
    expect(prevLink).toHaveAttribute('aria-disabled', 'true')
    expect(prevLink.className).toContain('cursor-not-allowed')
  })

  it('disables next button on last page', () => {
    render(<Pagination totalPages={5} currentPage={5} />)
    const nextLink = screen.getByTestId('chevron-right').closest('a')!
    expect(nextLink).toHaveAttribute('aria-disabled', 'true')
    expect(nextLink.className).toContain('cursor-not-allowed')
  })

  it('renders at most 5 page buttons for large page counts', () => {
    render(<Pagination totalPages={20} currentPage={10} />)
    // Should show pages 8, 9, 10, 11, 12
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    // Should not show pages outside the window
    expect(screen.queryByText('7')).not.toBeInTheDocument()
    expect(screen.queryByText('13')).not.toBeInTheDocument()
  })

  it('generates correct page URLs with href', () => {
    render(<Pagination totalPages={3} currentPage={1} />)
    const page2Link = screen.getByText('2').closest('a')
    expect(page2Link).toHaveAttribute('href', '/ko?page=2')
  })
})
