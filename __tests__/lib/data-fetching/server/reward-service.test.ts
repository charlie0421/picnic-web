import { describe, it, expect, vi, beforeEach } from 'vitest';

// 테스트 환경의 react 18 에는 cache 가 없다 — 그대로 통과시킨다.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));

let result: { data: unknown; error: { message: string; code?: string } | null };
const from = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      from(table);
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        single: () => Promise.resolve(result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  }),
}));

import { getRewardById } from '@/lib/data-fetching/server/reward-service';

/**
 * /[lang]/rewards/[id] 는 ISR 이고, 페이지는 "null = 없는 리워드(404)" 와 "예외 = 조회 장애(캐시하지 않음)" 를
 * 이 함수의 결과로 구분한다. 잘못된 id 는 장애가 아니라 없는 리워드여야 한다 — 그렇지 않으면 /rewards/abc 가 500 이 된다.
 */
describe('reward-service getRewardById', () => {
  beforeEach(() => {
    from.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('리워드를 돌려준다', async () => {
    result = { data: { id: 12, title: { ko: '전광판' }, deleted_at: null, created_at: 'c', updated_at: 'u', main_image: 'm', vote_reward: [] }, error: null };

    await expect(getRewardById('12')).resolves.toMatchObject({ id: 12, mainImage: 'm', votes: [] });
  });

  it('없는 id(PGRST116)는 null 이다', async () => {
    result = { data: null, error: { message: 'no rows', code: 'PGRST116' } };

    await expect(getRewardById('999999')).resolves.toBeNull();
  });

  it.each(['abc', '12abc', '-1', '1.5', '', ' 12', '1e3'])('정수가 아닌 id %j 는 조회 없이 null 이다', async (id) => {
    result = { data: null, error: { message: 'invalid input syntax for type bigint', code: '22P02' } };

    await expect(getRewardById(id)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('범위를 벗어난 숫자 id(22003)는 장애가 아니라 없는 리워드다', async () => {
    result = { data: null, error: { message: 'value is out of range for type integer', code: '22003' } };

    await expect(getRewardById('99999999999999999999')).resolves.toBeNull();
  });

  it('조회 장애는 예외로 전파한다', async () => {
    result = { data: null, error: { message: 'connection reset', code: '08006' } };

    await expect(getRewardById('12')).rejects.toThrow(/connection reset/);
  });
});
