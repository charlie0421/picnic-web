import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const getRewardsDirect = vi.fn();
vi.mock('@/utils/api/queries-content', () => ({
  _getRewards: (...args: unknown[]) => getRewardsDirect(...args),
}));

// utils/api/queries 의 getRewards 는 _getRewards 를 withRetry 로 한 번 더 감싼다. ISR 경로가 이것을 쓰면
// 예외 전파(throwOnError) 때문에 바깥 재시도가 돌아 장애 시 렌더가 약 30초·쿼리 12회로 늘어난다.
vi.mock('@/utils/api/queries', () => ({
  getRewards: () => {
    throw new Error('RewardListFetcher must not use the retry-wrapped getRewards');
  },
}));

vi.mock('@/components/client/reward/RewardPresenter', () => ({
  RewardListPresenter: ({ rewards }: { rewards: unknown[] }) => <div data-testid="presenter">{rewards.length}</div>,
}));

import { RewardListFetcher } from '@/components/server/reward/RewardListFetcher';

/**
 * /[lang]/rewards 는 ISR(60초)이다. 조회 실패를 샘플 리워드로 바꿔 렌더하면 그 화면이 캐시에 저장돼
 * 정상 목록을 덮는다. 실패는 예외로 전파해 재생성을 실패시킨다(Next 가 마지막 정상 페이지를 유지).
 */
describe('RewardListFetcher — ISR 에서의 조회 실패', () => {
  beforeEach(() => {
    getRewardsDirect.mockReset();
  });

  it('재시도를 한 겹만 가진 _getRewards 에 예외 전파를 요구한다', async () => {
    getRewardsDirect.mockResolvedValue([]);
    await RewardListFetcher();
    expect(getRewardsDirect).toHaveBeenCalledTimes(1);
    expect(getRewardsDirect).toHaveBeenCalledWith(8, { throwOnError: true });
  });

  it('조회가 실패하면 폴백을 렌더하지 않고 예외로 끝난다', async () => {
    getRewardsDirect.mockRejectedValue(new Error('DB down'));
    await expect(RewardListFetcher()).rejects.toThrow('DB down');
  });

  // 빈 상태 화면(RewardFallbackShowcase: "곧 공개될 리워드 라인업" 안내와 예시 3종)은 2025-11 부터 있던 UI 다.
  // 조회 계층이 빈 결과에 샘플 리워드(id -1)를 돌려주던 탓에 도달할 수 없었다. 여기서 막는 것은
  // "DB 리워드인 척하는 가짜 항목"(목록 카드로 렌더되고 상세 링크가 없는 리워드로 가는 것)이다.
  it('리워드가 실제로 없으면 리워드 목록이 아니라 준비된 빈 상태 화면을 렌더한다', async () => {
    getRewardsDirect.mockResolvedValue([]);
    const html = renderToStaticMarkup(await RewardListFetcher());
    expect(html).toContain('곧 공개될 리워드 라인업');
    expect(html).not.toContain('data-testid="presenter"');
    expect(html).not.toMatch(/샘플 리워드|Sample Reward/);
    expect(html).not.toMatch(/href="[^"]*\/rewards\//);
  });

  it('리워드가 있으면 목록을 렌더한다', async () => {
    getRewardsDirect.mockResolvedValue([
      { id: 1, title: { ko: '전광판' }, thumbnail: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, title: { ko: '팝업' }, thumbnail: null, created_at: '2026-01-02T00:00:00Z' },
    ]);
    const html = renderToStaticMarkup(await RewardListFetcher());
    expect(html).toContain('<div data-testid="presenter">2</div>');
  });
});
