import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import VoteLoadingSkeleton from '@/components/client/vote/list/VoteLoadingSkeleton';

describe('VoteLoadingSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<VoteLoadingSkeleton />);
    expect(container).toBeTruthy();
  });

  it('renders 8 skeleton cards', () => {
    const { container } = render(<VoteLoadingSkeleton />);
    const skeletonCards = container.querySelectorAll('.animate-pulse');
    expect(skeletonCards).toHaveLength(8);
  });

  it('renders grid layout', () => {
    const { container } = render(<VoteLoadingSkeleton />);
    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveClass('grid');
    expect(grid).toHaveClass('grid-cols-1');
  });

  it('each skeleton card has an image placeholder', () => {
    const { container } = render(<VoteLoadingSkeleton />);
    const imagePlaceholders = container.querySelectorAll('.aspect-square');
    expect(imagePlaceholders).toHaveLength(8);
  });

  it('each skeleton card has text placeholders', () => {
    const { container } = render(<VoteLoadingSkeleton />);
    // Each card has 3 text lines in p-4 div
    const cards = container.querySelectorAll('.animate-pulse');
    cards.forEach((card) => {
      const textLines = card.querySelectorAll('.bg-gray-200.rounded');
      expect(textLines.length).toBeGreaterThanOrEqual(3);
    });
  });
});
