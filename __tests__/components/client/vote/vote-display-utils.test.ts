import { describe, expect, it } from 'vitest';
import {
  formatCandidateVote,
  filterActiveVoteItems,
  formatVoteShare,
  sharePercentDecimals,
  sumVoteTotals,
} from '@/components/client/vote/common/vote-display-utils';

describe('vote display utilities', () => {
  it('uses two to four decimals based on percentage magnitude', () => {
    expect(sharePercentDecimals(35.1972)).toBe(2);
    expect(sharePercentDecimals(0.179)).toBe(2);
    expect(sharePercentDecimals(0.0763)).toBe(3);
    expect(sharePercentDecimals(0.0032)).toBe(4);
  });

  it.each([
    [711479, 2021408, '35.20%'],
    [1790, 1000000, '0.18%'],
    [763, 1000000, '0.076%'],
    [32, 1000000, '0.0032%'],
    [35199, 100000, '35.20%'],
    [1, 2891788, '<0.0001%'],
    [500, 500, '100.00%'],
  ])('formats %s of %s as %s', (votes, total, expected) => {
    expect(formatVoteShare(votes, total)).toBe(expected);
  });

  it('uses an em dash when no share can be shown', () => {
    expect(formatVoteShare(0, 100)).toBe('—');
    expect(formatVoteShare(null, 100)).toBe('—');
    expect(formatVoteShare(-1, 100)).toBe('—');
    expect(formatVoteShare(10, 0)).toBe('—');
  });

  it('adds raw votes in parentheses for active admins', () => {
    expect(formatCandidateVote({
      votes: 711479,
      totalVotes: 2021408,
      status: 'ongoing',
      isAdmin: true,
    })).toBe('35.20% (711,479)');
  });

  it('keeps completed votes as raw counts and supports the vote unit', () => {
    expect(formatCandidateVote({
      votes: 711479,
      totalVotes: 2021408,
      status: 'completed',
      isAdmin: true,
    })).toBe('711,479');
    expect(formatCandidateVote({
      votes: 711479,
      totalVotes: 2021408,
      status: 'completed',
      includeVoteUnit: true,
    })).toBe('711,479 표');
  });

  it('uses an em dash for upcoming votes', () => {
    expect(formatCandidateVote({
      votes: 10,
      totalVotes: 100,
      status: 'upcoming',
    })).toBe('—');
  });

  it('sums only non-deleted positive vote totals', () => {
    expect(sumVoteTotals([
      { vote_total: 100 },
      null,
      { vote_total: null },
      { vote_total: -5 },
      { vote_total: 50, deleted_at: '2026-01-01' },
      { vote_total: 25 },
    ])).toBe(125);
  });

  it('filters deleted candidates before ranking or rendering', () => {
    const active = { id: 1, vote_total: 70 };
    const deleted = { id: 2, vote_total: 1000, deleted_at: '2026-01-01' };
    expect(filterActiveVoteItems([active, deleted, null])).toEqual([active]);
  });
});
