import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VotePodium } from '@/components/client/vote/detail/VotePodium';

vi.mock('@/components/client/vote', () => ({
  VoteRankCard: ({ item, voteDisplay }: any) => (
    <div>{item.id}:{voteDisplay}</div>
  ),
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => (key === 'vote_runner_up_gap_notice' ? '{gap}표 차이' : key),
    currentLanguage: 'ko',
    isHydrated: true,
  }),
}));

describe('VotePodium 2위 갭 안내 — 유일 2위 조건이 사라져도 최초 gap을 유지한다', () => {
  it('안내가 뜬 뒤 폴링 결과가 동률로 바뀌어도 "0표 차이"가 아니라 최초 gap 값을 계속 보여준다', () => {
    const uniqueSecond = [
      { id: 1, vote_total: 100 },
      { id: 2, vote_total: 70 },
      { id: 3, vote_total: 30 },
    ] as any;

    const { rerender } = render(
      <VotePodium
        rankedItems={uniqueSecond}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={200}
        voteStatus="ongoing"
        isAdmin={false}
      />,
    );

    expect(screen.getByText('30표 차이')).toBeInTheDocument();

    // 5초 만료 전 폴링으로 2위 동률(gap === null)이 된다.
    const tied = [
      { id: 1, vote_total: 100 },
      { id: 2, vote_total: 100 },
      { id: 3, vote_total: 30 },
    ] as any;

    rerender(
      <VotePodium
        rankedItems={tied}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={230}
        voteStatus="ongoing"
        isAdmin={false}
      />,
    );

    expect(screen.queryByText('0표 차이')).toBeNull();
    expect(screen.getByText('30표 차이')).toBeInTheDocument();
  });
});
