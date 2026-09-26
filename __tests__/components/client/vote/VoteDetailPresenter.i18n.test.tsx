import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** DES-004: 영어 투표 상세 화면에 한국어 하드코딩이 보이면 안 된다. */
vi.mock('@/stores/languageStore', async () => {
  const en = (await import('@/public/locales/en.json')).default as Record<string, string>;
  const translate = (key: string, args?: Record<string, string>) => {
    let value = en[key] ?? key;
    for (const [k, v] of Object.entries(args ?? {})) value = value.replace(`{${k}}`, v);
    return value;
  };
  const state = { currentLanguage: 'en', t: translate };
  const useLanguageStore: any = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  useLanguageStore.getState = () => state;
  return { useLanguageStore };
});

const items = [
  { id: 1, vote_total: 70, rank: 1, artist: { name: { en: 'IU' } } },
  { id: 2, vote_total: 30, rank: 2, artist: { name: {} } },
] as any;

vi.mock('@/components/client/vote/detail/useVoteDetail', () => ({
  useVoteDetail: () => ({
    currentLanguage: 'en', voteItems: items, notifications: [], removeNotification: vi.fn(),
    pollingStartTime: null, lastPollingUpdate: null, pollingErrorCount: 0, updateVoteDataPolling: vi.fn(),
    user: null, isVoting: false, timeLeft: { days: 1, hours: 2, minutes: 3, seconds: 4 },
    showVoteModal: false, voteCandidate: null, headerHeight: 0, headerRef: { current: null },
    voteStatus: 'ongoing', canVote: true, searchQuery: 'zzz', handleCardClick: vi.fn(), cancelVote: vi.fn(),
    handleSearch: vi.fn(), rankedVoteItems: items, filteredItems: [], totalVotes: 100, isAdmin: false,
    formatVotePeriod: () => 'Sep 1, 2026 ~ Sep 30, 2026', vote: { id: 1, title: { en: 'Debut Vote' } },
    rewards: [{ id: 9 }], className: '',
  }),
}));
vi.mock('@/components/client/vote', () => ({ VoteRankCard: () => null, VoteCard: () => null }));
vi.mock('@/components/common', () => ({
  Badge: () => null,
  Card: Object.assign(({ children }: any) => <div>{children}</div>, { Body: ({ children }: any) => <div>{children}</div> }),
}));
vi.mock('@/components/ui/OptimizedImage', () => ({ OptimizedImage: ({ alt }: any) => <img alt={alt} /> }));
vi.mock('@/components/client/vote/detail/VoteSearch', () => ({
  VoteSearch: ({ placeholder }: any) => <input placeholder={placeholder} />,
}));
vi.mock('@/components/client/vote/common/VoteButton', () => ({ VoteButton: () => null }));
vi.mock('@/components/client/vote/dialogs/VoteDialog', () => ({ default: () => null }));
vi.mock('@/components/client/vote/detail/VoteNotifications', () => ({ VoteNotifications: () => null }));
vi.mock('@/components/client/vote/detail/VotePodium', () => ({
  VotePodium: ({ renderTimer }: any) => <div>{renderTimer()}</div>,
}));
vi.mock('@/utils/api/strings', () => ({ getLocalizedString: (value: any) => value?.en ?? '' }));

import { VoteDetailPresenter } from '@/components/client/vote/detail/VoteDetailPresenter';

const HANGUL = /[ㄱ-힝]/;

describe('VoteDetailPresenter — 영어 화면에 한국어 없음', () => {
  it('상태·총 투표수·타이머·검색·순위·빈 결과·리워드 문구가 모두 번역된다', () => {
    const { container } = render(<VoteDetailPresenter {...({} as any)} />);
    const text = container.textContent ?? '';
    const placeholders = Array.from(container.querySelectorAll('[placeholder]')).map((el) => el.getAttribute('placeholder'));
    const labels = Array.from(container.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label'));

    expect(text).not.toMatch(HANGUL);
    expect(placeholders.join(' ')).not.toMatch(HANGUL);
    expect(labels.join(' ')).not.toMatch(HANGUL);
    expect(text).toContain('Ongoing');
    expect(text).toContain('No search results found.');
  });
});
