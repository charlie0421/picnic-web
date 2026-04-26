import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GridView } from '@/components/client/vote/common/GridView';

vi.mock('@/utils/api/strings', () => ({
  getLocalizedString: (value: any, lang?: string) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value?.ko || value?.en || '';
  },
  hasValidLocalizedString: (value: any) => !!value,
}));

vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} data-testid="optimized-image" />
  ),
}));

const makeItem = (id: number, name = `Artist ${id}`, image = '/test.png') => ({
  id,
  vote_id: 1,
  vote_total: id * 100,
  artist_id: id,
  group_id: 1,
  created_at: '2024-01-01',
  artist: {
    id,
    name: { ko: name, en: name },
    image,
  },
});

describe('GridView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when items array is empty', () => {
    const { container } = render(<GridView items={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when items is undefined-ish (treated as empty)', () => {
    const { container } = render(<GridView items={[] as any} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders circular style by default', () => {
    const items = [makeItem(1), makeItem(2)];
    render(<GridView items={items} />);
    // Should render artist names
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
    expect(screen.getByText('Artist 2')).toBeInTheDocument();
  });

  it('renders card style when style="card"', () => {
    const items = [makeItem(1), makeItem(2)];
    render(<GridView items={items} style="card" />);
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
    expect(screen.getByText('Artist 2')).toBeInTheDocument();
  });

  it('renders with custom keyPrefix', () => {
    const items = [makeItem(1)];
    render(<GridView items={items} keyPrefix="custom" />);
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
  });

  it('renders images with OptimizedImage', () => {
    const items = [makeItem(1)];
    render(<GridView items={items} />);
    expect(screen.getAllByTestId('optimized-image').length).toBeGreaterThan(0);
  });

  it('falls back to default image when artist has no image', () => {
    const item = makeItem(1);
    item.artist.image = '';
    render(<GridView items={[item]} />);
    const img = screen.getByTestId('optimized-image');
    expect(img).toHaveAttribute('src', '/images/default-artist.png');
  });

  it('falls back to "아티스트" when artist name is empty', () => {
    const item = makeItem(1);
    item.artist.name = { ko: '', en: '' };
    render(<GridView items={[item]} />);
    expect(screen.getByText('아티스트')).toBeInTheDocument();
  });

  it('renders pagination when enablePagination is true and has multiple pages', () => {
    const items = Array.from({ length: 15 }, (_, i) => makeItem(i + 1));
    render(<GridView items={items} enablePagination itemsPerPage={5} />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('does not render pagination when only one page', () => {
    const items = [makeItem(1), makeItem(2)];
    render(<GridView items={items} enablePagination itemsPerPage={10} />);
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('navigates to next page', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
    render(<GridView items={items} enablePagination itemsPerPage={5} />);

    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    const nextButton = screen.getAllByRole('button').find(
      (btn) => !btn.hasAttribute('disabled') && btn.querySelector('path[d*="7.293"]'),
    );

    // Click next
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]); // second button is next

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('navigates to prev page', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
    render(<GridView items={items} enablePagination itemsPerPage={5} />);

    const buttons = screen.getAllByRole('button');
    // Go to page 2 first
    fireEvent.click(buttons[1]);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Go back to page 1
    fireEvent.click(buttons[0]);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('disables prev button on first page', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
    render(<GridView items={items} enablePagination itemsPerPage={5} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
  });

  it('disables next button on last page', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1));
    render(<GridView items={items} enablePagination itemsPerPage={5} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]); // go to last page

    expect(buttons[1]).toBeDisabled();
  });

  it('applies disabled styling for card style', () => {
    const items = [makeItem(1)];
    const { container } = render(<GridView items={items} style="card" disabled />);
    // Should have opacity-70 class
    const wrapper = container.querySelector('.opacity-70');
    expect(wrapper).not.toBeNull();
  });

  it('handles cardSize sm', () => {
    const items = [makeItem(1)];
    render(<GridView items={items} style="card" cardSize="sm" />);
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
  });

  it('handles cardSize lg', () => {
    const items = [makeItem(1)];
    render(<GridView items={items} style="card" cardSize="lg" />);
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
  });

  it('handles cardSize md (default)', () => {
    const items = [makeItem(1)];
    render(<GridView items={items} style="card" cardSize="md" />);
    expect(screen.getByText('Artist 1')).toBeInTheDocument();
  });

  it('uses custom gridColumnsClassName when provided', () => {
    const items = [makeItem(1)];
    const { container } = render(
      <GridView items={items} gridColumnsClassName="grid-cols-6" />,
    );
    const grid = container.querySelector('.grid-cols-6');
    expect(grid).not.toBeNull();
  });

  it('computes itemsPerPage from rows and columns', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem(i + 1));
    render(
      <GridView
        items={items}
        enablePagination
        rows={2}
        fixedColumns={4}
      />,
    );
    // 2 rows * 4 columns = 8 items per page -> 20/8 = 3 pages
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('handles items without artist object', () => {
    const item = { id: 1, vote_id: 1, vote_total: 100, artist_id: 1, group_id: 1, created_at: '2024-01-01' } as any;
    render(<GridView items={[item]} />);
    expect(screen.getByText('아티스트')).toBeInTheDocument();
  });
});
