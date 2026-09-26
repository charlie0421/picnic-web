import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/vote/results 는 목록·상세 API 와 같은 공개 조건(visible_at <= now)을 따른다.
 * 미공개 투표(visible_at NULL·미래)는 관리자에게만 결과를 보여준다 (SEC-08 잔여).
 */
const mocks = vi.hoisted(() => {
  const state = {
    vote: null as Record<string, unknown> | null,
    items: [] as Array<Record<string, unknown>>,
    isAdmin: false,
  };
  return {
    state,
    lteCalls: [] as Array<{ table: string; column: string }>,
    getCurrentUserContext: vi.fn(async () => ({
      isAuthenticated: state.isAdmin,
      isAdmin: state.isAdmin,
    })),
  };
});

function createBuilder(table: string) {
  let visibilityFiltered = false;
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    is: chain,
    order: chain,
    lte: (column: string) => {
      mocks.lteCalls.push({ table, column });
      if (column === 'visible_at') visibilityFiltered = true;
      return builder;
    },
    single: async () => {
      const vote = mocks.state.vote;
      const visibleAt = vote?.visible_at;
      const parsed = typeof visibleAt === 'string' ? Date.parse(visibleAt) : Number.NaN;
      const hidden = !Number.isFinite(parsed) || parsed > Date.now();
      if (!vote || (visibilityFiltered && hidden)) {
        return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      return { data: vote, error: null };
    },
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: table === 'vote_item' ? mocks.state.items : [], error: null }),
  });
  return builder;
}

vi.mock('@/utils/supabase-server-client', () => ({
  createClient: async () => ({ from: (table: string) => createBuilder(table) }),
}));

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

import { GET } from '@/app/api/vote/results/route';

const PAST = '2026-01-01T00:00:00Z';
const FUTURE = '2999-01-01T00:00:00Z';

const vote = (visibleAt: string | null) => ({
  id: 7,
  title: { ko: '미공개 투표' },
  start_at: '2026-01-01T00:00:00Z',
  stop_at: '2999-01-02T00:00:00Z',
  deleted_at: null,
  visible_at: visibleAt,
});

const request = () => new NextRequest('https://www.picnic.fan/api/vote/results?voteId=7');

describe('GET /api/vote/results — 공개 조건', () => {
  beforeEach(() => {
    mocks.state.vote = null;
    mocks.state.items = [{ id: 1, vote_id: 7, artist_id: 3, group_id: 1, vote_total: 10, artist: null }];
    mocks.state.isAdmin = false;
    mocks.lteCalls.length = 0;
    mocks.getCurrentUserContext.mockClear();
  });

  it('공개 투표는 visible_at 조건으로 조회하고 결과를 반환한다', async () => {
    mocks.state.vote = vote(PAST);
    const res = await GET(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(1);
    expect(mocks.lteCalls).toContainEqual({ table: 'vote', column: 'visible_at' });
    // 공개 경로는 인증 조회를 하지 않는다
    expect(mocks.getCurrentUserContext).not.toHaveBeenCalled();
  });

  it.each([
    ['visible_at 이 없는', null],
    ['visible_at 이 미래인', FUTURE],
  ])('%s 미공개 투표는 비관리자에게 404', async (_label, visibleAt) => {
    mocks.state.vote = vote(visibleAt);
    const res = await GET(request());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.data).toBeUndefined();
  });

  it('미공개 투표도 관리자에게는 결과를 반환한다', async () => {
    mocks.state.vote = vote(FUTURE);
    mocks.state.isAdmin = true;
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect((await res.json()).data.voteId).toBe(7);
  });
});
