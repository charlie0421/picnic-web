import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetcherMocks = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(),
  getVotes: vi.fn(),
}));

vi.mock('@/components/client/vote/list', () => ({
  VoteFilterSectionDeferred: () => null,
  VoteListCSR: () => null,
}));

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: fetcherMocks.getCurrentUserContext,
}));

vi.mock('@/lib/data-fetching/server/vote-service', () => ({
  getVotes: fetcherMocks.getVotes,
}));

import { VoteListFetcher } from '@/components/server/vote/VoteListFetcher';

describe('VoteListFetcher user-context cost guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetcherMocks.getVotes.mockResolvedValue([]);
    fetcherMocks.getCurrentUserContext.mockResolvedValue({ isAuthenticated: false });
  });

  it('does not resolve user context for a public status', async () => {
    await VoteListFetcher({ status: 'ongoing', area: 'all' });

    expect(fetcherMocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(fetcherMocks.getVotes).toHaveBeenCalledWith('ongoing', 'all', 1, 12);
  });

  it('still resolves user context before serving the admin status', async () => {
    await VoteListFetcher({ status: 'admin', area: 'all' });

    expect(fetcherMocks.getCurrentUserContext).toHaveBeenCalledTimes(1);
    expect(fetcherMocks.getVotes).toHaveBeenCalledWith('ongoing', 'all', 1, 12);
  });
});
