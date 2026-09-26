import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

const getVoteByIdImpl = vi.hoisted(() => vi.fn(async (id: number) => ({ id })));

vi.mock('@/utils/api/queries-vote', () => ({
  _getVotes: vi.fn(),
  _getVoteById: getVoteByIdImpl,
  _getVoteItems: vi.fn(),
  _getVoteRewards: vi.fn(),
}));

vi.mock('@/utils/api/queries-content', () => ({
  _getRewards: vi.fn(),
  _getBanners: vi.fn(async () => []),
  _getRewardById: vi.fn(),
  _getMedias: vi.fn(),
  _getPopups: vi.fn(),
}));

import { getVoteById, getBanners } from '@/utils/api/queries';

/**
 * utils/api/queries 는 서버 컴포넌트뿐 아니라 클라이언트 훅(hooks/useBanner)도 import 한다.
 * 설치된 react 는 18.3.1 이라 React.cache 가 없을 수 있다 — 그 런타임에서도 모듈 로드와
 * 호출이 그대로 동작해야 한다(요청 단위 공유만 빠진다).
 */
describe('utils/api/queries — React.cache 가 없는 런타임', () => {
  it('이 테스트 런타임의 React 에는 cache 가 없다 (전제 확인)', () => {
    expect((React as { cache?: unknown }).cache).toBeUndefined();
  });

  it('getVoteById 는 캐시 없이 매번 그대로 호출된다', async () => {
    await expect(getVoteById(1)).resolves.toEqual({ id: 1 });
    await expect(getVoteById(1)).resolves.toEqual({ id: 1 });
    expect(getVoteByIdImpl).toHaveBeenCalledTimes(2);
  });

  it('다른 조회 함수도 그대로 동작한다', async () => {
    await expect(getBanners()).resolves.toEqual([]);
  });

  it('클라이언트 훅(useBanner) import 경로도 로드된다', async () => {
    const mod = await import('@/hooks/useBanner');
    expect(typeof mod.useBanner).toBe('function');
  });
});
