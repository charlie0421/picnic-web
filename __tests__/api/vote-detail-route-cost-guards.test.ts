import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => {
  const state = {
    vote: {} as Record<string, unknown>,
    items: [] as Array<Record<string, unknown>>,
    rewards: [] as Array<Record<string, unknown>>,
    isAdmin: false,
    deferVote: false,
    resolveVote: null as null | (() => void),
  };

  return {
    state,
    fromCalls: [] as string[],
    selectCalls: new Map<string, string[]>(),
    getCurrentUserContext: vi.fn(async () => ({
      isAuthenticated: state.isAdmin,
      isAdmin: state.isAdmin,
    })),
  };
});

function withoutPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPrivateFields);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'private_note')
      .map(([key, child]) => [key, withoutPrivateFields(child)]),
  );
}

function createBuilder(table: string) {
  let selectedColumns = '*';
  let visibilityFiltered = false;
  let deletedRewardsFiltered = false;

  const materialize = (value: unknown) =>
    selectedColumns.includes('*') ? value : withoutPrivateFields(value);

  const resultForTable = () => {
    if (table === 'vote') {
      const visibleAt = Date.parse(String(routeMocks.state.vote.visible_at));
      const hidden = Number.isFinite(visibleAt) && visibleAt > Date.now();
      const data = visibilityFiltered && hidden
        ? null
        : materialize(routeMocks.state.vote);
      return {
        data,
        error: data ? null : { message: 'not found' },
      };
    }

    if (table === 'vote_item') {
      return { data: materialize(routeMocks.state.items), error: null };
    }

    if (table === 'vote_reward') {
      return {
        data: routeMocks.state.rewards
          .filter((reward) => !deletedRewardsFiltered || reward.deleted_at === null)
          .map((reward) => ({
          reward_id: reward.id,
          reward: materialize(reward),
          })),
        error: null,
      };
    }

    if (table === 'reward') {
      const rewards = routeMocks.state.rewards.filter(
        (reward) => !deletedRewardsFiltered || reward.deleted_at === null,
      );
      return { data: materialize(rewards), error: null };
    }

    return { data: [], error: null };
  };

  const builder: any = {
    select(columns: string) {
      selectedColumns = columns;
      const calls = routeMocks.selectCalls.get(table) || [];
      calls.push(columns);
      routeMocks.selectCalls.set(table, calls);
      return builder;
    },
    eq() {
      return builder;
    },
    is(column: string) {
      if (
        (table === 'vote_reward' && column === 'reward.deleted_at') ||
        (table === 'reward' && column === 'deleted_at')
      ) {
        deletedRewardsFiltered = true;
      }
      return builder;
    },
    in() {
      return builder;
    },
    lte() {
      visibilityFiltered = true;
      return builder;
    },
    single() {
      const result = resultForTable();
      if (!routeMocks.state.deferVote || table !== 'vote') {
        return Promise.resolve(result);
      }

      return new Promise((resolve) => {
        routeMocks.state.resolveVote = () => resolve(result);
      });
    },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(resultForTable()).then(resolve, reject);
    },
  };

  return builder;
}

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: routeMocks.getCurrentUserContext,
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: (table: string) => {
      routeMocks.fromCalls.push(table);
      return createBuilder(table);
    },
  })),
}));

import { GET } from '@/app/api/vote/[id]/detail/route';

const request = (headers?: HeadersInit) =>
  new NextRequest('http://localhost/api/vote/295/detail', { headers });

const context = { params: Promise.resolve({ id: '295' }) };

describe('GET /api/vote/[id]/detail cost and disclosure guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.fromCalls.length = 0;
    routeMocks.selectCalls.clear();
    routeMocks.state.isAdmin = false;
    routeMocks.state.deferVote = false;
    routeMocks.state.resolveVote = null;
    routeMocks.state.vote = {
      id: 295,
      area: 'all',
      areas: ['all'],
      created_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
      is_partnership: false,
      main_image: 'vote.webp',
      order: 1,
      partner: null,
      result_image: null,
      star_candy_bonus_total: 0,
      star_candy_total: 0,
      start_at: '2026-01-01T00:00:00.000Z',
      stop_at: '2099-01-01T00:00:00.000Z',
      title: { ko: '테스트 투표' },
      updated_at: '2026-09-26T00:00:00.000Z',
      visible_at: '2020-01-01T00:00:00.000Z',
      vote_category: 'birthday',
      vote_content: null,
      vote_sub_category: null,
      vote_total: 10,
      wait_image: null,
      private_note: 'must not leak',
    };
    routeMocks.state.items = [{
      id: 1,
      artist_id: 10,
      group_id: 20,
      vote_id: 295,
      vote_total: 10,
      star_candy_bonus_total: 0,
      star_candy_total: 10,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-09-26T00:00:00.000Z',
      deleted_at: null,
      artist: {
        id: 10,
        name: { ko: '아티스트' },
        image: 'artist.webp',
        private_note: 'artist secret',
        artistGroup: { id: 20, name: { ko: '그룹' }, private_note: 'group secret' },
      },
      private_note: 'item secret',
    }];
    routeMocks.state.rewards = [
      {
        id: 7,
        title: { ko: '리워드' },
        thumbnail: 'reward.webp',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-09-26T00:00:00.000Z',
        deleted_at: null,
        location: null,
        location_images: null,
        order: 1,
        overview_images: null,
        size_guide: null,
        size_guide_images: null,
        private_note: 'reward secret',
      },
      {
        id: 8,
        title: { ko: '삭제된 리워드' },
        thumbnail: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-09-26T00:00:00.000Z',
        deleted_at: '2026-09-26T00:00:00.000Z',
      },
    ];
  });

  it('returns 404 for a future vote to a non-admin', async () => {
    routeMocks.state.vote.visible_at = '2099-01-01T00:00:00.000Z';

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Vote not found' });
  });

  it('returns the stable public response shape without unselected fields', async () => {
    const response = await GET(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=2, stale-while-revalidate=5',
    );
    expect(body).toMatchObject({
      vote: {
        id: 295,
        title: { ko: '테스트 투표' },
        vote_item: [{ id: 1, artist: { id: 10, artistGroup: { id: 20 } } }],
      },
      rewards: [{ id: 7, title: { ko: '리워드' } }],
    });
    expect(body.vote.private_note).toBeUndefined();
    expect(body.vote.vote_item[0].private_note).toBeUndefined();
    expect(body.vote.vote_item[0].artist.private_note).toBeUndefined();
    expect(body.rewards[0].private_note).toBeUndefined();
  });

  it('keeps ETag/304 and the public cache contract together', async () => {
    const first = await GET(request(), context);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await GET(request({ 'if-none-match': etag! }), context);

    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
    expect(second.headers.get('cache-control')).toBe(
      'public, s-maxage=2, stale-while-revalidate=5',
    );
  });

  it('does not return soft-deleted rewards', async () => {
    const response = await GET(request(), context);
    const body = await response.json();

    expect(body.rewards.map((reward: { id: number }) => reward.id)).toEqual([7]);
  });

  it('allows an admin to inspect a future vote without public caching', async () => {
    routeMocks.state.isAdmin = true;
    routeMocks.state.vote.visible_at = '2099-01-01T00:00:00.000Z';

    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
  });

  it('starts vote, item, and reward reads before waiting for the vote read', async () => {
    routeMocks.state.deferVote = true;

    const responsePromise = GET(request(), context);
    await vi.waitFor(() => {
      expect(routeMocks.fromCalls.length).toBeGreaterThan(0);
    });

    expect(routeMocks.fromCalls).toEqual(
      expect.arrayContaining(['vote', 'vote_item', 'vote_reward']),
    );

    routeMocks.state.resolveVote?.();
    const response = await responsePromise;
    expect(response.status).toBe(200);
  });
});
