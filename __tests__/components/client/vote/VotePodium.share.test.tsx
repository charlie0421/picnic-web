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
    t: (key: string) => key,
    currentLanguage: 'en',
    isHydrated: true,
  }),
}));

const items = [
  { id: 1, vote_total: 70 },
  { id: 2, vote_total: 20 },
  { id: 3, vote_total: 10 },
] as any;

describe('VotePodium vote shares', () => {
  it('shows percentage labels for ongoing votes', () => {
    render(
      <VotePodium
        rankedItems={items}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={100}
        voteStatus="ongoing"
        isAdmin={false}
      />,
    );
    expect(screen.getByText('1:70.00%')).toBeInTheDocument();
    expect(screen.getByText('2:20.00%')).toBeInTheDocument();
    expect(screen.getByText('3:10.00%')).toBeInTheDocument();
  });

  it('includes raw counts for admins', () => {
    render(
      <VotePodium
        rankedItems={items}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={100}
        voteStatus="ongoing"
        isAdmin
      />,
    );
    expect(screen.getByText('1:70.00% (70)')).toBeInTheDocument();
  });

  it('keeps completed vote counts raw', () => {
    render(
      <VotePodium
        rankedItems={items}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={100}
        voteStatus="completed"
        isAdmin
      />,
    );
    expect(screen.getByText('1:70')).toBeInTheDocument();
  });
});

describe('VotePodium runner-up gap notice', () => {
  it('진행중이고 유일 2위면 갭 안내를 표시한다', () => {
    render(
      <VotePodium
        rankedItems={items}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={100}
        voteStatus="ongoing"
        isAdmin={false}
      />,
    );
    expect(screen.getByText('vote_runner_up_gap_notice')).toBeInTheDocument();
  });

  it('종료된 투표에는 갭 안내를 표시하지 않는다', () => {
    render(
      <VotePodium
        rankedItems={items}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={100}
        voteStatus="completed"
        isAdmin={false}
      />,
    );
    expect(screen.queryByText('vote_runner_up_gap_notice')).toBeNull();
  });

  it('2위가 동률이면 갭 안내를 표시하지 않는다', () => {
    const tiedItems = [
      { id: 1, vote_total: 70 },
      { id: 2, vote_total: 20 },
      { id: 3, vote_total: 20 },
    ] as any;
    render(
      <VotePodium
        rankedItems={tiedItems}
        renderTimer={() => null}
        headerHeight={0}
        totalVotes={110}
        voteStatus="ongoing"
        isAdmin={false}
      />,
    );
    expect(screen.queryByText('vote_runner_up_gap_notice')).toBeNull();
  });
});
