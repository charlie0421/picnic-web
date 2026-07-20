import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoteDetailPresenter } from '@/components/client/vote/detail/VoteDetailPresenter';

let status: 'ongoing' | 'completed' = 'ongoing';
let isAdmin = false;

const items = [
  { id: 1, vote_total: 70, rank: 1, artist: { name: { ko: 'A' } } },
  { id: 2, vote_total: 30, rank: 2, artist: { name: { ko: 'B' } } },
] as any;

vi.mock('@/components/client/vote/detail/useVoteDetail', () => ({
  useVoteDetail: () => ({
    currentLanguage: 'ko',
    voteItems: items,
    notifications: [],
    removeNotification: vi.fn(),
    pollingStartTime: null,
    lastPollingUpdate: null,
    pollingErrorCount: 0,
    updateVoteDataPolling: vi.fn(),
    user: null,
    isVoting: false,
    timeLeft: null,
    showVoteModal: false,
    voteCandidate: null,
    headerHeight: 0,
    headerRef: { current: null },
    voteStatus: status,
    canVote: status === 'ongoing',
    searchQuery: '',
    handleCardClick: vi.fn(),
    cancelVote: vi.fn(),
    handleSearch: vi.fn(),
    rankedVoteItems: items,
    filteredItems: items,
    totalVotes: 100,
    isAdmin,
    formatVotePeriod: () => 'period',
    vote: { id: 1, title: { ko: '투표' } },
    rewards: [],
    className: '',
  }),
}));

vi.mock('@/components/client/vote', () => ({
  VoteRankCard: ({ item, voteDisplay }: any) => <div>{item.id}:{voteDisplay}</div>,
  VoteCard: () => null,
}));
vi.mock('@/components/common', () => ({
  Badge: () => null,
  Card: Object.assign(({ children }: any) => <div>{children}</div>, {
    Body: ({ children }: any) => <div>{children}</div>,
  }),
}));
vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: ({ alt }: any) => <span>{alt}</span>,
}));
vi.mock('@/components/client/vote/common/VoteTimer', () => ({ VoteTimer: () => null }));
vi.mock('@/components/client/vote/detail/VoteSearch', () => ({ VoteSearch: () => null }));
vi.mock('@/components/client/vote/common/VoteButton', () => ({ VoteButton: () => null }));
vi.mock('@/components/client/vote/dialogs/VoteDialog', () => ({ default: () => null }));
vi.mock('@/components/client/vote/detail/VoteNotifications', () => ({ VoteNotifications: () => null }));
vi.mock('@/utils/api/strings', () => ({
  getLocalizedString: (value: any) => value?.ko ?? '',
}));

describe('VoteDetailPresenter share display', () => {
  beforeEach(() => {
    status = 'ongoing';
    isAdmin = false;
  });

  it('shows shares in the grid and preserves the raw header total', () => {
    render(<VoteDetailPresenter {...({} as any)} />);
    expect(screen.getAllByText('70.00%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30.00%').length).toBeGreaterThan(0);
    expect(screen.getByText(/총 100 표/)).toBeInTheDocument();
  });

  it('shows admin raw counts in parentheses', () => {
    isAdmin = true;
    render(<VoteDetailPresenter {...({} as any)} />);
    expect(screen.getAllByText('70.00% (70)').length).toBeGreaterThan(0);
  });

  it('keeps completed grid and podium values raw', () => {
    status = 'completed';
    isAdmin = true;
    render(<VoteDetailPresenter {...({} as any)} />);
    expect(screen.getAllByText('70 표').length).toBeGreaterThan(0);
    expect(screen.getByText('1:70')).toBeInTheDocument();
  });
});
