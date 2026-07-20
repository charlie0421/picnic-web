import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VotePodium } from '@/components/client/vote/detail/VotePodium';

vi.mock('@/components/client/vote', () => ({
  VoteRankCard: ({ item, voteDisplay }: any) => (
    <div>{item.id}:{voteDisplay}</div>
  ),
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
});
