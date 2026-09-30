import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRewards = vi.fn();
vi.mock('@/utils/api/queries', () => ({ getRewards: (...args: unknown[]) => getRewards(...args) }));
vi.mock('@/components/client/reward/RewardPresenter', () => ({ RewardListPresenter: () => null }));

import { RewardListFetcher } from '@/components/server/reward/RewardListFetcher';

/**
 * /[lang]/rewards 는 ISR(60초)이다. 조회 실패를 샘플 리워드로 바꿔 렌더하면 그 화면이 캐시에 저장돼
 * 정상 목록을 덮는다. 실패는 예외로 전파해 재생성을 실패시킨다(Next 가 마지막 정상 페이지를 유지).
 */
describe('RewardListFetcher — ISR 에서의 조회 실패', () => {
  beforeEach(() => {
    getRewards.mockReset();
  });

  it('조회에 예외 전파를 요구한다', async () => {
    getRewards.mockResolvedValue([]);
    await RewardListFetcher();
    expect(getRewards).toHaveBeenCalledWith(8, { throwOnError: true });
  });

  it('조회가 실패하면 폴백을 렌더하지 않고 예외로 끝난다', async () => {
    getRewards.mockRejectedValue(new Error('DB down'));
    await expect(RewardListFetcher()).rejects.toThrow('DB down');
  });
});
