import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildVoteQuery } from '@/lib/data-fetching/server/vote-service-query';

/**
 * 후보(vote_item) 득표순 정렬은 NULLS LAST 여야 한다.
 *
 * DB 인덱스 vote_item_vote_id_total_active_idx 는 (vote_id, vote_total DESC NULLS LAST)
 * WHERE deleted_at IS NULL 이다. supabase-js 의 `ascending: false` 는 기본이 NULLS FIRST 라
 * 이 인덱스와 방향이 어긋나고, PostgreSQL 은 투표마다 후보 전체를 정렬했다
 * (운영 pg_stat_statements 6721025931549208208: 웹 목록 SSR 평균 1.7초). 앱
 * (picnic-app vote_list_provider) 은 이미 NULLS LAST 로 요청한다. vote_total 은 NOT NULL
 * 이라 결과 순서는 바뀌지 않는다.
 */
type OrderCall = { column: string; ascending?: boolean; nullsFirst?: boolean; referencedTable?: string };

function createMockClient() {
  const orderCalls: OrderCall[] = [];
  const builder: any = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn((column: string, opts?: Omit<OrderCall, 'column'>) => {
      orderCalls.push({ column, ...(opts ?? {}) });
      return builder;
    }),
  };
  const client: any = { from: vi.fn(() => builder) };
  return { client, orderCalls };
}

describe('웹 투표 목록 — 후보 득표순 NULLS LAST', () => {
  for (const status of [undefined, 'ongoing', 'completed', 'upcoming', 'admin']) {
    it(`status=${status ?? '(기본)'} 에서 vote_item 정렬은 vote_total DESC NULLS LAST`, () => {
      const { client, orderCalls } = createMockClient();
      buildVoteQuery(client, status, 'all');

      const itemOrders = orderCalls.filter((c) => c.referencedTable === 'vote_item');
      expect(itemOrders).toEqual([
        { column: 'vote_total', ascending: false, nullsFirst: false, referencedTable: 'vote_item' },
      ]);
    });
  }
});

describe('투표 결과 API — 후보 득표순 NULLS LAST', () => {
  const orderCalls: OrderCall[] = [];

  beforeEach(() => {
    orderCalls.length = 0;
    vi.resetModules();
  });

  it('vote_item 조회를 vote_total DESC NULLS LAST 로 정렬한다', async () => {
    const voteRow = {
      id: 1, title: { ko: 't' }, start_at: '2020-01-01T00:00:00Z', stop_at: '2020-01-02T00:00:00Z', deleted_at: null,
    };
    const makeBuilder = (table: string) => {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        is: vi.fn(() => b),
        single: vi.fn(async () => ({ data: voteRow, error: null })),
        order: vi.fn((column: string, opts?: Omit<OrderCall, 'column'>) => {
          orderCalls.push({ column, ...(opts ?? {}) });
          return Promise.resolve({ data: [], error: null });
        }),
      };
      return b;
    };
    vi.doMock('@/utils/supabase-server-client', () => ({
      createClient: vi.fn(async () => ({ from: vi.fn((table: string) => makeBuilder(table)) })),
    }));

    const { GET } = await import('@/app/api/vote/results/route');
    const res = await GET(new Request('http://localhost/api/vote/results?voteId=1') as any);

    expect(res.status).toBe(200);
    expect(orderCalls).toEqual([{ column: 'vote_total', ascending: false, nullsFirst: false }]);
  });
});
