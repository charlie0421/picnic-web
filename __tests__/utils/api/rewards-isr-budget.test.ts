import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// queries-helpers(타임아웃)와 retry-utils(재시도)는 실제 구현을 쓴다 — 둘의 합성이 검증 대상이다.
const limit = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseClient: () => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      is: () => builder,
      order: () => builder,
      limit: (...args: unknown[]) => limit(...args),
    };
    return { from: () => builder };
  },
}));

vi.mock('@/components/client/reward/RewardPresenter', () => ({ RewardListPresenter: () => null }));

import { _getRewards } from '@/utils/api/queries-content';
import { RewardListFetcher } from '@/components/server/reward/RewardListFetcher';

type Settled = 'pending' | 'resolved' | 'rejected';
const track = (promise: Promise<unknown>) => {
  const state: { value: Settled; error?: unknown; result?: unknown } = { value: 'pending' };
  promise.then(
    (result) => {
      state.value = 'resolved';
      state.result = result;
    },
    (error) => {
      state.value = 'rejected';
      state.error = error;
    },
  );
  return state;
};

/**
 * ISR 페이지(/[lang]/rewards)의 리워드 조회가 장애 때 얼마나 오래, 몇 번 시도하는지 고정한다.
 * 프리빌드되지 않은 언어의 첫 요청은 이 시간을 그대로 기다린 뒤 500 을 받고, 장애 중에는 요청마다 반복된다.
 */
describe('리워드 ISR 조회 — 장애 시 시도 횟수와 시간 예산', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    limit.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('빠르게 실패하는 조회는 3번 시도한 뒤 원래 오류로 끝난다', async () => {
    const queryError = { message: 'fetch failed' };
    limit.mockResolvedValue({ data: null, error: queryError });

    const state = track(_getRewards(8, { throwOnError: true }));
    await vi.advanceTimersByTimeAsync(300 + 600);

    expect(state.value).toBe('rejected');
    expect(state.error).toBe(queryError);
    expect(limit).toHaveBeenCalledTimes(3);
  });

  it('응답이 없는 조회는 7초에 타임아웃 예외로 끝나고, 샘플 리워드로 대체하지 않는다', async () => {
    limit.mockReturnValue(new Promise(() => {}));

    const state = track(_getRewards(8, { throwOnError: true }));
    await vi.advanceTimersByTimeAsync(6999);
    expect(state.value).toBe('pending');

    await vi.advanceTimersByTimeAsync(1);
    expect(state.value).toBe('rejected');
    expect(String((state.error as Error).message)).toMatch(/getRewards exceeded 7000ms/);
  });

  it('페이지가 쓰는 경로(RewardListFetcher)는 응답 없는 DB 에서 7초 안에 끝난다 — 바깥 재시도로 30초가 되지 않는다', async () => {
    limit.mockReturnValue(new Promise(() => {}));

    const state = track(RewardListFetcher());
    await vi.advanceTimersByTimeAsync(7000);

    expect(state.value).toBe('rejected');
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('페이지가 쓰는 경로는 빠르게 실패하는 DB 에 쿼리를 3번만 보낸다 — 12번이 아니다', async () => {
    limit.mockResolvedValue({ data: null, error: { message: 'fetch failed' } });

    const state = track(RewardListFetcher());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(state.value).toBe('rejected');
    expect(limit).toHaveBeenCalledTimes(3);
  });
});
