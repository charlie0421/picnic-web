import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetcherMocks = vi.hoisted(() => ({
  getVoteById: vi.fn(),
  getVoteItems: vi.fn(),
  getVoteRewards: vi.fn(),
  getCurrentUserContext: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@/utils/api/queries', () => ({
  getVoteById: fetcherMocks.getVoteById,
  getVoteItems: fetcherMocks.getVoteItems,
  getVoteRewards: fetcherMocks.getVoteRewards,
}));

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: fetcherMocks.getCurrentUserContext,
}));

vi.mock('next/navigation', () => ({
  notFound: fetcherMocks.notFound,
}));

vi.mock('@/components/client/vote/detail/VoteDetailClientOnly', () => ({
  default: () => null,
}));

import VoteDetailFetcher from '@/components/server/vote/VoteDetailFetcher';

describe('VoteDetailFetcher polling default', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetcherMocks.getVoteById.mockResolvedValue({
      id: 295,
      visible_at: '2020-01-01T00:00:00.000Z',
    });
    fetcherMocks.getVoteItems.mockResolvedValue([]);
    fetcherMocks.getVoteRewards.mockResolvedValue([]);
    fetcherMocks.getCurrentUserContext.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    fetcherMocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
  });

  it('passes the approved five-second polling interval to the client', async () => {
    const element = await VoteDetailFetcher({
      voteId: '295',
      lang: 'ko',
    });

    expect((element as any).props.pollingInterval).toBe(5000);
    expect(fetcherMocks.getCurrentUserContext).not.toHaveBeenCalled();
  });

  it.each([
    null,
    '2099-01-01T00:00:00.000Z',
  ])('returns not found for a non-admin when visible_at is %s', async (visibleAt) => {
    fetcherMocks.getVoteById.mockResolvedValue({ id: 295, visible_at: visibleAt });

    await expect(VoteDetailFetcher({ voteId: '295', lang: 'ko' })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );

    expect(fetcherMocks.getCurrentUserContext).toHaveBeenCalledTimes(1);
    expect(fetcherMocks.getVoteItems).not.toHaveBeenCalled();
    expect(fetcherMocks.getVoteRewards).not.toHaveBeenCalled();
  });

  it('allows an admin to render a future vote', async () => {
    fetcherMocks.getVoteById.mockResolvedValue({
      id: 295,
      visible_at: '2099-01-01T00:00:00.000Z',
    });
    fetcherMocks.getCurrentUserContext.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    const element = await VoteDetailFetcher({ voteId: '295', lang: 'ko' });

    expect((element as any).props.vote.id).toBe(295);
    expect(fetcherMocks.getVoteItems).toHaveBeenCalledWith(295);
    expect(fetcherMocks.getVoteRewards).toHaveBeenCalledWith(295);
  });
});
