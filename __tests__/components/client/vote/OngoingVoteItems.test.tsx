import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OngoingVoteItems } from '@/components/client/vote/list/OngoingVoteItems';

let profile: { is_admin?: boolean; is_super_admin?: boolean } | null = null;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ userProfile: profile }),
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => key,
    currentLanguage: 'ko',
  }),
}));

vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

const vote = {
  id: 1,
  updated_at: '2026-01-01T00:00:00Z',
  voteItem: [
    { id: 1, vote_total: 70, artist: { name: { ko: 'A' } } },
    { id: 2, vote_total: 30, artist: { name: { ko: 'B' } } },
  ],
} as any;

describe('OngoingVoteItems vote shares', () => {
  beforeEach(() => {
    profile = null;
  });

  it('shows percentages to regular users', () => {
    render(<OngoingVoteItems vote={vote} mode="list" />);
    expect(screen.getByText('70.00%')).toBeInTheDocument();
    expect(screen.getByText('30.00%')).toBeInTheDocument();
  });

  it('shows raw counts in parentheses to admins', () => {
    profile = { is_admin: true };
    render(<OngoingVoteItems vote={vote} mode="list" />);
    expect(screen.getByText('70.00% (70)')).toBeInTheDocument();
    expect(screen.getByText('30.00% (30)')).toBeInTheDocument();
  });
});
