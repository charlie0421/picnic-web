import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoteRankCard } from '@/components/client/vote/common/VoteRankCard';
import {
  getFullWidthSize,
  getRankStyles,
  VOTE_CHANGE_ANIMATION_MS,
} from '@/components/client/vote/common/vote-rank-card-utils';

// Mock dependencies
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => key,
    currentLanguage: 'ko',
    isHydrated: true,
  }),
}));

const mockWithAuth = vi.fn(async (fn: () => Promise<any>) => fn());
vi.mock('@/hooks/useAuthGuard', () => ({
  useRequireAuth: () => ({
    withAuth: mockWithAuth,
  }),
}));

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

vi.mock('@/components/ui/animations/RealtimeAnimations', () => ({
  AnimatedCount: ({ value, className }: any) => <span className={className}>{value}</span>,
}));

vi.mock('@/components/client/vote/common/VoteRankCardAnimated', () => ({
  default: (props: any) => (
    <div data-testid="animated-card">
      <span>{props.artistName}</span>
      <span>{props.displayVoteTotal}</span>
    </div>
  ),
}));

const makeItem = (overrides: any = {}) => ({
  id: 1,
  vote_id: 1,
  vote_total: 500,
  artist_id: 1,
  group_id: 1,
  created_at: '2024-01-01',
  artist: {
    id: 1,
    name: { ko: 'Test Artist', en: 'Test Artist' },
    image: '/test.png',
    artistGroup: null,
  },
  ...overrides,
});

describe('vote-rank-card-utils', () => {
  describe('VOTE_CHANGE_ANIMATION_MS', () => {
    it('should be 3000', () => {
      expect(VOTE_CHANGE_ANIMATION_MS).toBe(3000);
    });
  });

  describe('getFullWidthSize', () => {
    it('returns rank 1 sizes', () => {
      const result = getFullWidthSize(1);
      expect(result.image).toContain('md:w-32');
      expect(result.padding).toContain('p-2');
      expect(result.name).toBe('text-sm');
      expect(result.votes).toBe('text-sm');
    });

    it('returns rank 2 sizes', () => {
      const result = getFullWidthSize(2);
      expect(result.image).toContain('w-24');
      expect(result.padding).toContain('p-1');
      expect(result.name).toBe('text-xs');
    });

    it('returns rank 3 sizes', () => {
      const result = getFullWidthSize(3);
      expect(result.image).toContain('w-10');
      expect(result.padding).toBe('p-1');
    });

    it('returns default sizes for rank > 3', () => {
      const result = getFullWidthSize(5);
      expect(result.image).toBe('w-12 h-12');
      expect(result.padding).toBe('p-1');
    });
  });

  describe('getRankStyles', () => {
    it('returns gold style for rank 1', () => {
      const result = getRankStyles(1);
      expect(result).toContain('from-yellow-50');
      expect(result).toContain('border-yellow-300');
    });

    it('returns gold style with green border for rank 1 updated', () => {
      const result = getRankStyles(1, true);
      expect(result).toContain('border-green-400');
    });

    it('returns silver style for rank 2', () => {
      const result = getRankStyles(2);
      expect(result).toContain('from-gray-50');
      expect(result).toContain('border-gray-300');
    });

    it('returns silver style with green border for rank 2 updated', () => {
      const result = getRankStyles(2, true);
      expect(result).toContain('border-green-400');
    });

    it('returns amber style for rank 3+', () => {
      const result = getRankStyles(3);
      expect(result).toContain('from-amber-50');
      expect(result).toContain('border-amber-300');
    });

    it('returns amber style with green border for rank 3+ updated', () => {
      const result = getRankStyles(4, true);
      expect(result).toContain('border-green-400');
    });
  });
});

describe('VoteRankCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with enableMotionAnimations=false (static card)', () => {
    render(
      <VoteRankCard item={makeItem()} rank={1} enableMotionAnimations={false} />,
    );
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('renders animated card when enableMotionAnimations=true (default)', () => {
    render(<VoteRankCard item={makeItem()} rank={1} />);
    expect(screen.getByTestId('animated-card')).toBeInTheDocument();
  });

  it('uses voteTotal prop when provided', () => {
    render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        voteTotal={999}
        enableMotionAnimations={false}
      />,
    );
    expect(screen.getByText('999')).toBeInTheDocument();
  });

  it('falls back to item.vote_total when voteTotal is undefined', () => {
    render(
      <VoteRankCard
        item={makeItem({ vote_total: 777 })}
        rank={1}
        enableMotionAnimations={false}
      />,
    );
    expect(screen.getByText('777')).toBeInTheDocument();
  });

  it('uses fallback artist name when artist is null', () => {
    render(
      <VoteRankCard
        item={makeItem({ artist: null })}
        rank={1}
        enableMotionAnimations={false}
      />,
    );
    expect(screen.getByText('artist_name_fallback')).toBeInTheDocument();
  });

  it('uses default image when artist has no image', () => {
    const item = makeItem();
    item.artist.image = null;
    render(
      <VoteRankCard item={item} rank={1} enableMotionAnimations={false} />,
    );
    const img = screen.getByTestId('optimized-image');
    expect(img).toHaveAttribute('src', '/images/default-artist.png');
  });

  it('displays artist group name when present', () => {
    const item = makeItem();
    item.artist.artistGroup = { name: { ko: 'Test Group', en: 'Test Group' } };
    render(
      <VoteRankCard item={item} rank={1} enableMotionAnimations={false} />,
    );
    expect(screen.getByText('Test Group')).toBeInTheDocument();
  });

  it('does not display group name when artistGroup is null', () => {
    const item = makeItem();
    item.artist.artistGroup = null;
    render(
      <VoteRankCard item={item} rank={1} enableMotionAnimations={false} />,
    );
    expect(screen.queryByText('Test Group')).not.toBeInTheDocument();
  });

  it('applies animate-pulse class when isAnimating', () => {
    const { container } = render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        isAnimating
        enableMotionAnimations={false}
      />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('applies cursor-pointer when onVoteChange is provided', () => {
    const { container } = render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        onVoteChange={vi.fn()}
        enableMotionAnimations={false}
      />,
    );
    expect(container.querySelector('.cursor-pointer')).not.toBeNull();
  });

  it('applies cursor-default when onVoteChange is not provided', () => {
    const { container } = render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        enableMotionAnimations={false}
      />,
    );
    expect(container.querySelector('.cursor-default')).not.toBeNull();
  });

  it('handles card click with onVoteChange and authentication', async () => {
    const onVoteChange = vi.fn();
    render(
      <VoteRankCard
        item={makeItem({ vote_total: 100 })}
        rank={1}
        onVoteChange={onVoteChange}
        enableMotionAnimations={false}
      />,
    );

    const card = screen.getByText('Test Artist').closest('[class*="relative flex"]')!;
    await act(async () => {
      fireEvent.click(card);
    });

    expect(mockWithAuth).toHaveBeenCalled();
    expect(onVoteChange).toHaveBeenCalledWith(101);
  });

  it('does nothing on click when onVoteChange is not provided', async () => {
    render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        enableMotionAnimations={false}
      />,
    );

    const card = screen.getByText('Test Artist').closest('[class*="relative flex"]')!;
    await act(async () => {
      fireEvent.click(card);
    });

    expect(mockWithAuth).not.toHaveBeenCalled();
  });

  it('handles auth failure (withAuth returns null)', async () => {
    mockWithAuth.mockResolvedValueOnce(null);
    const onVoteChange = vi.fn();
    render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        onVoteChange={onVoteChange}
        enableMotionAnimations={false}
      />,
    );

    const card = screen.getByText('Test Artist').closest('[class*="relative flex"]')!;
    await act(async () => {
      fireEvent.click(card);
    });

    expect(onVoteChange).not.toHaveBeenCalled();
  });

  it('shows vote change animation when voteChange is provided', () => {
    render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        voteChange={5}
        showVoteChange
        enableMotionAnimations={false}
      />,
    );

    expect(screen.getByText('+5')).toBeInTheDocument();
  });

  it('hides vote change animation after timeout', () => {
    render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        voteChange={5}
        showVoteChange
        enableMotionAnimations={false}
      />,
    );

    expect(screen.getByText('+5')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(VOTE_CHANGE_ANIMATION_MS + 100);
    });

    expect(screen.queryByText('+5')).not.toBeInTheDocument();
  });

  it('shows negative vote change', () => {
    render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        voteChange={-3}
        showVoteChange
        enableMotionAnimations={false}
      />,
    );

    expect(screen.getByText('-3')).toBeInTheDocument();
  });

  it('uses voteTotal when available for click handler', async () => {
    const onVoteChange = vi.fn();
    render(
      <VoteRankCard
        item={makeItem({ vote_total: 50 })}
        rank={1}
        voteTotal={200}
        onVoteChange={onVoteChange}
        enableMotionAnimations={false}
      />,
    );

    const card = screen.getByText('Test Artist').closest('[class*="relative flex"]')!;
    await act(async () => {
      fireEvent.click(card);
    });

    // Should use voteTotal (200) + 1 = 201
    expect(onVoteChange).toHaveBeenCalledWith(201);
  });

  it('applies custom className', () => {
    const { container } = render(
      <VoteRankCard
        item={makeItem()}
        rank={1}
        className="custom-class"
        enableMotionAnimations={false}
      />,
    );
    expect(container.querySelector('.custom-class')).not.toBeNull();
  });

  it('applies isUpdated style when _realtimeInfo.isUpdated is true', () => {
    const item = makeItem();
    item._realtimeInfo = { isUpdated: true };
    const { container } = render(
      <VoteRankCard item={item} rank={1} enableMotionAnimations={false} />,
    );
    expect(container.querySelector('.text-green-600')).not.toBeNull();
  });
});
