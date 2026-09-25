import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/api/queries', () => ({
  getVoteById: vi.fn().mockResolvedValue({ id: 295 }),
  getVoteItems: vi.fn().mockResolvedValue([]),
  getVoteRewards: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/client/vote/detail/VoteDetailClientOnly', () => ({
  default: () => null,
}));

import VoteDetailFetcher from '@/components/server/vote/VoteDetailFetcher';

describe('VoteDetailFetcher polling default', () => {
  it('passes the approved five-second polling interval to the client', async () => {
    const element = await VoteDetailFetcher({
      voteId: '295',
      lang: 'ko',
    });

    expect((element as any).props.pollingInterval).toBe(5000);
  });
});
