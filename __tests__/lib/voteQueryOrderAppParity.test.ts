import { describe, it, expect, vi } from 'vitest';
import { getVotesClient } from '@/lib/data-fetching/client/vote-service.client';
import { shouldOrderByArea } from '@/lib/vote/vote-order';

/**
 * 앱 `vote_list_provider.dart:112-160` 의 정렬 계약을 웹 쿼리 빌더에 잠근다.
 *
 * 앱은 debug(=웹 admin) 목록에서 `order('area', ASC)` 를 **먼저**, `order('id', DESC)` 를
 * 나중에 호출한다. PostgREST 는 먼저 호출한 order 가 주 정렬이므로 호출 순서 자체가 계약이다.
 */
type OrderCall = { column: string; ascending?: boolean; referencedTable?: string };

function createMockClient() {
  const orderCalls: OrderCall[] = [];
  const containsCalls: Array<{ column: string; value: unknown }> = [];

  const builder: any = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    contains: vi.fn((column: string, value: unknown) => {
      containsCalls.push({ column, value });
      return builder;
    }),
    order: vi.fn((column: string, opts?: { ascending?: boolean; referencedTable?: string }) => {
      orderCalls.push({ column, ...(opts ?? {}) });
      return builder;
    }),
    // await 지점 — 빈 데이터로 끝낸다.
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };

  const client: any = { from: vi.fn(() => builder) };
  return { client, orderCalls, containsCalls };
}

describe('투표 쿼리 정렬 — 앱 동기화', () => {
  it('admin + 전체 탭은 area ASC 를 먼저, id DESC 를 나중에 호출한다', async () => {
    const { client, orderCalls } = createMockClient();
    await getVotesClient(client, 'admin', 'all');

    const topLevel = orderCalls.filter((call) => !call.referencedTable);
    expect(topLevel).toEqual([
      { column: 'area', ascending: true },
      { column: 'id', ascending: false },
    ]);
  });

  it('admin 이어도 특정 area 탭이면 area 정렬을 붙이지 않는다', async () => {
    const { client, orderCalls } = createMockClient();
    await getVotesClient(client, 'admin', 'pic-chart');

    const topLevel = orderCalls.filter((call) => !call.referencedTable);
    expect(topLevel.map((call) => call.column)).toEqual(['id']);
  });

  it('진행중 탭은 마감 임박순만 쓴다 — area 정렬을 붙이지 않는다', async () => {
    const { client, orderCalls } = createMockClient();
    await getVotesClient(client, 'ongoing', 'all');

    const topLevel = orderCalls.filter((call) => !call.referencedTable);
    expect(topLevel).toEqual([{ column: 'stop_at', ascending: true }]);
  });

  it('예정·종료 탭의 정렬 컬럼도 앱과 같다', async () => {
    const upcoming = createMockClient();
    await getVotesClient(upcoming.client, 'upcoming', 'all');
    expect(upcoming.orderCalls.filter((c) => !c.referencedTable)).toEqual([
      { column: 'start_at', ascending: true },
    ]);

    const completed = createMockClient();
    await getVotesClient(completed.client, 'completed', 'all');
    expect(completed.orderCalls.filter((c) => !c.referencedTable)).toEqual([
      { column: 'stop_at', ascending: false },
    ]);
  });

  it('area 필터는 앱과 같이 areas 배열 포함 여부로 건다', async () => {
    const { client, containsCalls } = createMockClient();
    await getVotesClient(client, 'ongoing', 'spotlight');

    expect(containsCalls).toEqual([{ column: 'areas', value: ['spotlight'] }]);
  });

  it('전체 탭에서는 area 필터를 걸지 않는다', async () => {
    const { client, containsCalls } = createMockClient();
    await getVotesClient(client, 'ongoing', 'all');

    expect(containsCalls).toEqual([]);
  });

  it('shouldOrderByArea 가 쿼리 빌더와 같은 판정을 낸다', () => {
    expect(shouldOrderByArea('admin', 'all')).toBe(true);
    expect(shouldOrderByArea('admin', 'kpop')).toBe(false);
    expect(shouldOrderByArea('ongoing', 'all')).toBe(false);
  });
});
