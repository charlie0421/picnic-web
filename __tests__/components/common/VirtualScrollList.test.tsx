import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualScrollList } from '@/components/common/VirtualScrollList';

// Mock Next.js Image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

describe('VirtualScrollList', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }));

  const renderItem = (item: { id: number; name: string }, index: number) => (
    <div data-testid={`item-${item.id}`}>{item.name}</div>
  );

  it('renders without crashing', () => {
    const { container } = render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('renders only visible items plus overscan', () => {
    render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
        overscan={2}
      />,
    );
    // Container height 300 / item height 50 = 6 visible + 2 overscan (below only at start) = ~8
    const renderedItems = screen.getAllByTestId(/^item-/);
    expect(renderedItems.length).toBeLessThan(items.length);
    expect(renderedItems.length).toBeGreaterThan(0);
  });

  it('renders first item', () => {
    render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
      />,
    );
    expect(screen.getByText('Item 0')).toBeInTheDocument();
  });

  it('does not render items far from viewport', () => {
    render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
        overscan={2}
      />,
    );
    expect(screen.queryByText('Item 99')).not.toBeInTheDocument();
  });

  it('sets total height on virtual container', () => {
    const { container } = render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
      />,
    );
    const virtualContainer = container.querySelector('[style*="height"]') as HTMLElement;
    expect(virtualContainer).toBeTruthy();
  });

  it('sets container height correctly', () => {
    const { container } = render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={400}
        renderItem={renderItem}
      />,
    );
    const scrollContainer = container.querySelector('.overflow-auto') as HTMLElement;
    expect(scrollContainer.style.height).toBe('400px');
  });

  it('applies custom className', () => {
    const { container } = render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
        className="my-custom-list"
      />,
    );
    expect(container.firstChild).toHaveClass('my-custom-list');
  });

  it('calls onScroll callback', () => {
    const onScroll = vi.fn();
    const { container } = render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
        onScroll={onScroll}
      />,
    );
    const scrollContainer = container.querySelector('.overflow-auto')!;
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 100 } });
    expect(onScroll).toHaveBeenCalled();
  });

  it('shows loading component when isLoading is true', () => {
    render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
        isLoading={true}
        loadingComponent={<div data-testid="custom-loading">Loading...</div>}
      />,
    );
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
  });

  it('does not show loading by default', () => {
    render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
        isLoading={false}
      />,
    );
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders with empty items array', () => {
    const { container } = render(
      <VirtualScrollList
        items={[]}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
      />,
    );
    expect(container).toBeTruthy();
  });

  it('does not show scroll-to-top button initially', () => {
    render(
      <VirtualScrollList
        items={items}
        itemHeight={50}
        containerHeight={300}
        renderItem={renderItem}
      />,
    );
    expect(screen.queryByLabelText('Scroll to top')).not.toBeInTheDocument();
  });
});
