import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoteDetailPresenter } from '@/components/client/vote/detail/VoteDetailPresenter';

/** DES-003: 후보 카드는 키보드로 포커스·선택할 수 있어야 한다. */
let canVote = true;
const handleCardClick = vi.fn();
const items = [
  { id: 1, vote_total: 70, rank: 1, artist: { name: { ko: '아이유' } } },
  { id: 2, vote_total: 30, rank: 2, artist: { name: { ko: '뉴진스' } } },
] as any;

vi.mock('@/components/client/vote/detail/useVoteDetail', () => ({
  useVoteDetail: () => ({
    currentLanguage: 'ko', voteItems: items, notifications: [], removeNotification: vi.fn(),
    pollingStartTime: null, lastPollingUpdate: null, pollingErrorCount: 0, updateVoteDataPolling: vi.fn(),
    user: null, isVoting: false, timeLeft: null, showVoteModal: false, voteCandidate: null,
    headerHeight: 0, headerRef: { current: null }, voteStatus: canVote ? 'ongoing' : 'completed', canVote,
    searchQuery: '', handleCardClick, cancelVote: vi.fn(), handleSearch: vi.fn(),
    rankedVoteItems: [], filteredItems: items, totalVotes: 100, isAdmin: false,
    formatVotePeriod: () => 'period', vote: { id: 1, title: { ko: '투표' } }, rewards: [], className: '',
  }),
}));
vi.mock('@/components/client/vote', () => ({ VoteRankCard: () => null, VoteCard: () => null }));
vi.mock('@/components/common', () => ({
  Badge: () => null,
  Card: Object.assign(({ children }: any) => <div>{children}</div>, { Body: ({ children }: any) => <div>{children}</div> }),
}));
vi.mock('@/components/ui/OptimizedImage', () => ({ OptimizedImage: ({ alt }: any) => <img alt={alt} /> }));
vi.mock('@/components/client/vote/common/VoteTimer', () => ({ VoteTimer: () => null }));
vi.mock('@/components/client/vote/detail/VoteSearch', () => ({ VoteSearch: () => null }));
vi.mock('@/components/client/vote/common/VoteButton', () => ({ VoteButton: () => null }));
vi.mock('@/components/client/vote/dialogs/VoteDialog', () => ({ default: () => null }));
vi.mock('@/components/client/vote/detail/VoteNotifications', () => ({ VoteNotifications: () => null }));
vi.mock('@/components/client/vote/detail/VotePodium', () => ({ VotePodium: () => null }));
vi.mock('@/utils/api/strings', () => ({ getLocalizedString: (value: any) => value?.ko ?? '' }));

describe('VoteDetailPresenter — 후보 카드 키보드 접근성', () => {
  beforeEach(() => {
    canVote = true;
    handleCardClick.mockClear();
  });

  it('투표 가능하면 후보 카드가 포커스 가능한 버튼이고 이름으로 찾을 수 있다', () => {
    render(<VoteDetailPresenter {...({} as any)} />);
    const card = screen.getByRole('button', { name: /아이유/ });
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).not.toHaveAttribute('aria-disabled', 'true');
  });

  it.each([['Enter'], [' ']])('%s 키로 후보를 선택한다', (key) => {
    render(<VoteDetailPresenter {...({} as any)} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /뉴진스/ }), { key });
    expect(handleCardClick).toHaveBeenCalledWith(items[1]);
  });

  it('투표 불가면 aria-disabled 이고 탭 순서에서 빠지며 키 입력을 무시한다', () => {
    canVote = false;
    render(<VoteDetailPresenter {...({} as any)} />);
    const card = screen.getByRole('button', { name: /아이유/ });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.click(card);
    expect(handleCardClick).not.toHaveBeenCalled();
  });
});
