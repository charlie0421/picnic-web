import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const queryMocks = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(),
  orderCalls: [] as Array<{ column: string; options?: Record<string, unknown> }>,
  limitCalls: [] as Array<{ count: number; options?: Record<string, unknown> }>,
  rangeCalls: [] as Array<[number, number]>,
  selectCalls: [] as string[],
  headerCalls: [] as Array<[string, string]>,
  result: { data: [] as any[], error: null as null | { message: string }, count: 0 },
}));

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: queryMocks.getCurrentUserContext,
}));

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseServerClient: () => {
    const builder: any = {
      select: (columns: string) => {
        queryMocks.selectCalls.push(columns);
        return builder;
      },
      is: () => builder,
      lte: () => builder,
      gt: () => builder,
      contains: () => builder,
      order: (column: string, options?: Record<string, unknown>) => {
        queryMocks.orderCalls.push({ column, options });
        return builder;
      },
      limit: (count: number, options?: Record<string, unknown>) => {
        queryMocks.limitCalls.push({ count, options });
        return builder;
      },
      setHeader: (name: string, value: string) => {
        queryMocks.headerCalls.push([name, value]);
        return builder;
      },
      range: (from: number, to: number) => {
        queryMocks.rangeCalls.push([from, to]);
        return Promise.resolve(queryMocks.result);
      },
    };
    return { from: () => builder };
  },
}));

import { GET } from '@/app/api/votes/route';

const request = (query: string) =>
  new NextRequest(`http://localhost/api/votes?${query}`);

describe('GET /api/votes cost and numeric guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.orderCalls.length = 0;
    queryMocks.limitCalls.length = 0;
    queryMocks.rangeCalls.length = 0;
    queryMocks.selectCalls.length = 0;
    queryMocks.headerCalls.length = 0;
    queryMocks.result = { data: [], error: null, count: 0 };
    queryMocks.getCurrentUserContext.mockResolvedValue({ isAuthenticated: false });
  });

  it.each([
    'page=x',
    'limit=x',
    'page=0',
    'limit=0',
    'limit=51',
    'page=1.5',
    'page=9007199254740992',
    'page=9007199254740991&limit=50',
  ])('rejects unsafe pagination: %s', async (query) => {
    const response = await GET(request(`status=ongoing&area=all&${query}`));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid pagination parameters' });
    expect(queryMocks.rangeCalls).toHaveLength(0);
  });

  it('skips user context for public statuses and keeps the indexed top-three query', async () => {
    const response = await GET(request('status=ongoing&area=all&page=1&limit=12'));

    expect(response.status).toBe(200);
    expect(queryMocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(queryMocks.orderCalls).toContainEqual({
      column: 'vote_total',
      options: {
        ascending: false,
        nullsFirst: false,
        referencedTable: 'vote_item',
      },
    });
    expect(queryMocks.limitCalls).toContainEqual({
      count: 3,
      options: { referencedTable: 'vote_item' },
    });
    expect(queryMocks.headerCalls).toContainEqual(['Prefer', 'count=exact']);
  });

  it('keeps the upcoming candidate limit at 24', async () => {
    await GET(request('status=upcoming&area=all&page=1&limit=12'));

    expect(queryMocks.limitCalls).toContainEqual({
      count: 24,
      options: { referencedTable: 'vote_item' },
    });
  });

  it('checks admin requests and downgrades a non-admin to ongoing', async () => {
    queryMocks.getCurrentUserContext.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });

    await GET(request('status=admin&area=all&page=1&limit=12'));

    expect(queryMocks.getCurrentUserContext).toHaveBeenCalledTimes(1);
    expect(queryMocks.orderCalls.map(({ column }) => column)).toContain('stop_at');
    expect(queryMocks.limitCalls).toContainEqual({
      count: 3,
      options: { referencedTable: 'vote_item' },
    });
  });

  it('preserves response keys, top-three ordering, and snake/camel aliases', async () => {
    queryMocks.result = {
      data: [{
        id: 1,
        title: { ko: '투표' },
        legacy_field: 'preserved',
        vote_item: [
          { id: 1, vote_total: 10, deleted_at: null },
          { id: 2, vote_total: 30, deleted_at: null },
          { id: 3, vote_total: 20, deleted_at: null },
          { id: 4, vote_total: 999, deleted_at: '2026-01-01' },
        ],
        vote_reward: [{ reward_id: 7, reward: { id: 7 } }],
      }],
      error: null,
      count: 1,
    };

    const response = await GET(request('status=ongoing&area=all&page=1&limit=12'));
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual([
      'count', 'data', 'hasMore', 'limit', 'page', 'totalPages',
    ]);
    expect(body.data[0].legacy_field).toBe('preserved');
    expect(body.data[0].vote_item.map((item: any) => item.id)).toEqual([2, 3, 1]);
    expect(body.data[0].voteItem).toEqual(body.data[0].vote_item);
    expect(body.data[0].voteReward).toEqual(body.data[0].vote_reward);
    expect(body).toMatchObject({
      count: 1,
      totalPages: 1,
      hasMore: false,
      page: 1,
      limit: 12,
    });
  });
});
