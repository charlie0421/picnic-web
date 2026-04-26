import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  VOTE_STATUS,
  computeVoteStatus,
  computeTimeLeft,
  getStatusText,
  getCategoryLabel,
  getSubCategoryLabel,
  toTitleCase,
  STATUS_TAG_COLORS,
  CATEGORY_COLORS,
  SUB_CATEGORY_COLORS,
} from '@/components/client/vote/list/vote-card-utils';

// --- Mock stores and hooks ---
const mockT = vi.fn((key: string) => '');
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: mockT,
    currentLanguage: 'en',
    isHydrated: true,
  }),
}));

vi.mock('@/hooks/useTranslationReady', () => ({
  useTranslationReady: () => true,
}));

vi.mock('@/contexts/GlobalLoadingContext', () => ({
  useGlobalLoading: () => ({ setIsLoading: vi.fn(), isLoading: false, forceStopLoading: vi.fn() }),
}));

vi.mock('@/hooks/useLocaleRouter', () => ({
  useLocaleRouter: () => ({
    currentLocale: 'en',
    extractLocaleFromPath: (p: string) => ({ locale: 'en', path: p }),
    getLocalizedPath: (p: string) => `/en${p}`,
    changeLocale: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, isLoading: false }),
}));

vi.mock('@/hooks/useAuthGuard', () => ({
  useAuthGuard: () => ({ navigateWithAuth: vi.fn() }),
}));

vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: (props: any) => <img src={props.src} alt={props.alt} data-testid="optimized-image" />,
}));

vi.mock('@/components/common/RewardItem', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid="reward-item">{props.reward?.id}</div>,
}));

vi.mock('@/utils/api/strings', () => ({
  getLocalizedString: (val: any, _lang?: string) => {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') return val.en || val.ko || '';
    return '';
  },
}));

vi.mock('@/utils/date', () => ({
  formatVotePeriodWithTimeZone: () => 'Jan 1 ~ Jan 31',
  formatRelativeTime: () => '2 days ago',
  formatSimpleDateWithTimeZone: () => 'Jan 1, 2025',
}));

vi.mock('@/components/client/vote/list/VoteItems', () => ({
  VoteItems: () => <div data-testid="vote-items" />,
}));

// ============================
// Unit tests for vote-card-utils
// ============================
describe('vote-card-utils', () => {
  describe('computeVoteStatus', () => {
    it('returns UPCOMING when no dates provided', () => {
      expect(computeVoteStatus(null, null, new Date())).toBe(VOTE_STATUS.UPCOMING);
    });

    it('returns UPCOMING when reference time is before start', () => {
      const start = '2099-01-01T00:00:00Z';
      const stop = '2099-02-01T00:00:00Z';
      expect(computeVoteStatus(start, stop, new Date())).toBe(VOTE_STATUS.UPCOMING);
    });

    it('returns ONGOING when reference time is between start and stop', () => {
      const start = '2020-01-01T00:00:00Z';
      const stop = '2099-02-01T00:00:00Z';
      expect(computeVoteStatus(start, stop, new Date())).toBe(VOTE_STATUS.ONGOING);
    });

    it('returns COMPLETED when reference time is after stop', () => {
      const start = '2020-01-01T00:00:00Z';
      const stop = '2020-02-01T00:00:00Z';
      expect(computeVoteStatus(start, stop, new Date())).toBe(VOTE_STATUS.COMPLETED);
    });
  });

  describe('computeTimeLeft', () => {
    it('returns null for COMPLETED status', () => {
      expect(computeTimeLeft(VOTE_STATUS.COMPLETED, null, null, new Date())).toBeNull();
    });

    it('returns zero time when target is in the past', () => {
      const result = computeTimeLeft(VOTE_STATUS.UPCOMING, '2020-01-01T00:00:00Z', null, new Date());
      expect(result).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    });

    it('calculates correct time left for upcoming vote', () => {
      const now = new Date('2025-01-01T00:00:00Z');
      const start = '2025-01-02T01:01:01Z';
      const result = computeTimeLeft(VOTE_STATUS.UPCOMING, start, null, now);
      expect(result).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    });

    it('uses stopAt for ongoing status', () => {
      const now = new Date('2025-01-01T00:00:00Z');
      const stop = '2025-01-01T02:30:00Z';
      const result = computeTimeLeft(VOTE_STATUS.ONGOING, null, stop, now);
      expect(result).toEqual({ days: 0, hours: 2, minutes: 30, seconds: 0 });
    });
  });

  describe('getStatusText', () => {
    it('returns translated text for ongoing', () => {
      const t = vi.fn((key: string) => {
        if (key === 'label_tabbar_vote_active') return 'Active';
        return '';
      });
      expect(getStatusText(VOTE_STATUS.ONGOING, t)).toBe('Active');
    });

    it('falls back to English label when translation is empty', () => {
      const t = vi.fn(() => '');
      expect(getStatusText(VOTE_STATUS.UPCOMING, t)).toBe('Upcoming');
      expect(getStatusText(VOTE_STATUS.COMPLETED, t)).toBe('Completed');
    });
  });

  describe('getCategoryLabel', () => {
    it('returns null for null/undefined category', () => {
      const t = vi.fn(() => '');
      expect(getCategoryLabel(null, t)).toBeNull();
      expect(getCategoryLabel(undefined, t)).toBeNull();
    });

    it('returns translation if available', () => {
      const t = vi.fn((key: string) => (key === 'label_vote_birthday' ? 'Birthday' : ''));
      expect(getCategoryLabel('birthday', t)).toBe('Birthday');
    });

    it('falls back to default label', () => {
      const t = vi.fn(() => '');
      expect(getCategoryLabel('birthday', t)).toBe('Birthday');
    });

    it('uses toTitleCase for unknown categories', () => {
      const t = vi.fn(() => '');
      expect(getCategoryLabel('custom_thing', t)).toBe('Custom Thing');
    });
  });

  describe('getSubCategoryLabel', () => {
    it('returns null for null subCategory', () => {
      const t = vi.fn(() => '');
      expect(getSubCategoryLabel(null, t)).toBeNull();
    });

    it('returns fallback for known subcategory', () => {
      const t = vi.fn(() => '');
      expect(getSubCategoryLabel('male', t)).toBe('Male');
    });
  });

  describe('toTitleCase', () => {
    it('converts underscore-separated to title case', () => {
      expect(toTitleCase('hello_world')).toBe('Hello World');
    });

    it('converts dash-separated to title case', () => {
      expect(toTitleCase('foo-bar-baz')).toBe('Foo Bar Baz');
    });

    it('handles extra spaces', () => {
      expect(toTitleCase('  hello   world  ')).toBe('Hello World');
    });
  });

  describe('constants', () => {
    it('STATUS_TAG_COLORS has entries for all statuses', () => {
      expect(STATUS_TAG_COLORS[VOTE_STATUS.UPCOMING]).toBeDefined();
      expect(STATUS_TAG_COLORS[VOTE_STATUS.ONGOING]).toBeDefined();
      expect(STATUS_TAG_COLORS[VOTE_STATUS.COMPLETED]).toBeDefined();
    });

    it('CATEGORY_COLORS has expected keys', () => {
      expect(CATEGORY_COLORS.birthday).toBeDefined();
      expect(CATEGORY_COLORS.debut).toBeDefined();
    });

    it('SUB_CATEGORY_COLORS has expected keys', () => {
      expect(SUB_CATEGORY_COLORS.male).toBeDefined();
      expect(SUB_CATEGORY_COLORS.female).toBeDefined();
    });
  });
});

// ============================
// Component tests for VoteCard
// ============================
describe('VoteCard', () => {
  const mockVote = {
    id: 1,
    area: 'global',
    areas: null,
    created_at: '2025-01-01T00:00:00Z',
    deleted_at: null,
    is_partnership: false,
    main_image: 'https://example.com/image.jpg',
    order: 1,
    partner: null,
    result_image: null,
    star_candy_bonus_total: null,
    star_candy_total: null,
    start_at: '2025-01-01T00:00:00Z',
    stop_at: '2099-12-31T00:00:00Z',
    title: { en: 'Test Vote', ko: '테스트 투표' },
    updated_at: '2025-01-01T00:00:00Z',
    visible_at: null,
    vote_category: 'birthday',
    vote_content: null,
    vote_sub_category: 'male',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockT.mockImplementation((key: string) => {
      const map: Record<string, string> = {
        label_tabbar_vote_active: 'Active',
        label_vote_birthday: 'Birthday',
        goonghap_gender_male: 'Male',
      };
      return map[key] || '';
    });
  });

  it('renders without crashing', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    const { container } = render(<VoteCard vote={mockVote as any} />);
    expect(container).toBeTruthy();
  });

  it('renders the vote title', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    expect(screen.getByText('Test Vote')).toBeInTheDocument();
  });

  it('renders main image when provided', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    const img = screen.getByTestId('optimized-image');
    expect(img).toBeInTheDocument();
  });

  it('renders vote items', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    expect(screen.getByTestId('vote-items')).toBeInTheDocument();
  });

  it('renders category and subcategory labels', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    expect(screen.getByText('Birthday')).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
  });

  it('renders status tag', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders rewards when present', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    const voteWithRewards = {
      ...mockVote,
      voteReward: [
        { reward: { id: 'r1', name: 'Reward 1' } },
      ],
    };
    render(<VoteCard vote={voteWithRewards as any} />);
    expect(screen.getByTestId('reward-item')).toBeInTheDocument();
  });

  it('does not render rewards section when empty', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    expect(screen.queryByTestId('reward-item')).not.toBeInTheDocument();
  });

  it('contains a link to vote detail', async () => {
    const { VoteCard } = await import('@/components/client/vote/list/VoteCard');
    render(<VoteCard vote={mockVote as any} />);
    const link = screen.getAllByRole('link')[0];
    expect(link).toHaveAttribute('href', expect.stringContaining('/vote/1'));
  });
});
