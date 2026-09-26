import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type AccessMode = 'public' | 'private';
type QueryError = { code: string; message: string };

const routeMocks = vi.hoisted(() => {
  const state = {
    vote: null as Record<string, unknown> | null,
    items: [] as Array<Record<string, unknown>>,
    rewardRows: [] as Array<{ reward_id: number; reward: Record<string, unknown> | null }>,
    isAdmin: false,
    publicVoteError: null as QueryError | null,
    privateVoteError: null as QueryError | null,
  };

  return {
    state,
    fromCalls: [] as Array<{ access: AccessMode; table: string }>,
    selectCalls: new Map<string, string[]>(),
    lteCalls: [] as Array<{
      access: AccessMode;
      table: string;
      column: string;
      value: unknown;
    }>,
    createPublicClient: vi.fn(),
    createPrivateClient: vi.fn(),
    getCurrentUserContext: vi.fn(async () => ({
      isAuthenticated: state.isAdmin,
      isAdmin: state.isAdmin,
    })),
  };
});

const notFoundError = (): QueryError => ({
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
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

function createBuilder(access: AccessMode, table: string) {
  let selectedColumns = '*';
  let visibilityFiltered = false;
  let deletedRewardsFiltered = false;

  const materialize = (value: unknown) =>
    selectedColumns.includes('*') ? value : withoutPrivateFields(value);

  const resultForTable = () => {
    if (table === 'vote') {
      const configuredError = access === 'public'
        ? routeMocks.state.publicVoteError
        : routeMocks.state.privateVoteError;
      if (configuredError) return { data: null, error: configuredError };

      const vote = routeMocks.state.vote;
      const visibleAt = vote?.visible_at;
      const parsedVisibleAt = typeof visibleAt === 'string' ? Date.parse(visibleAt) : Number.NaN;
      const hidden = visibleAt == null || (
        Number.isFinite(parsedVisibleAt) && parsedVisibleAt > Date.now()
      );
      if (!vote || (access === 'public' && visibilityFiltered && hidden)) {
        return { data: null, error: notFoundError() };
      }

      return { data: materialize(vote), error: null };
    }

    if (table === 'vote_item') {
      return { data: materialize(routeMocks.state.items), error: null };
    }

    if (table === 'vote_reward') {
      const rows = deletedRewardsFiltered
        ? routeMocks.state.rewardRows.filter(
          ({ reward }) => reward === null || reward.deleted_at === null,
        )
        : routeMocks.state.rewardRows;
      return { data: materialize(rows), error: null };
    }

    return { data: [], error: null };
  };

  const builder: any = {
    select(columns: string) {
      selectedColumns = columns;
      const key = `${access}:${table}`;
      const calls = routeMocks.selectCalls.get(key) || [];
      calls.push(columns);
      routeMocks.selectCalls.set(key, calls);
      return builder;
    },
    eq() {
      return builder;
    },
    is(column: string) {
      if (table === 'vote_reward' && column === 'reward.deleted_at') {
        deletedRewardsFiltered = true;
      }
      return builder;
    },
    lte(column: string, value: unknown) {
      routeMocks.lteCalls.push({ access, table, column, value });
      if (table === 'vote' && column === 'visible_at') visibilityFiltered = true;
      return builder;
    },
    single() {
      return Promise.resolve(resultForTable());
    },
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(resultForTable()).then(resolve, reject);
    },
  };

  return builder;
}

function createClient(access: AccessMode) {
  return {
    from(table: string) {
      routeMocks.fromCalls.push({ access, table });
      return createBuilder(access, table);
    },
  };
}

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: routeMocks.getCurrentUserContext,
}));

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseServerClient: routeMocks.createPublicClient,
  createSupabaseServerClient: routeMocks.createPrivateClient,
}));

import { GET } from '@/app/api/vote/[id]/detail/route';

const request = (headers?: HeadersInit) =>
  new NextRequest('http://localhost/api/vote/295/detail', { headers });

const context = { params: Promise.resolve({ id: '295' }) };
const normalizedSelect = (value: string) => value.replace(/\s+/g, ' ').trim();

describe('GET /api/vote/[id]/detail cost and disclosure guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.fromCalls.length = 0;
    routeMocks.selectCalls.clear();
    routeMocks.lteCalls.length = 0;
    routeMocks.state.isAdmin = false;
    routeMocks.state.publicVoteError = null;
    routeMocks.state.privateVoteError = null;
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
    routeMocks.state.rewardRows = [
      {
        reward_id: 7,
        reward: {
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
      },
      { reward_id: 8, reward: null },
      {
        reward_id: 9,
        reward: {
          id: 9,
          title: { ko: '삭제된 리워드' },
          deleted_at: '2026-09-26T00:00:00.000Z',
        },
      },
    ];
    routeMocks.createPublicClient.mockImplementation(() => createClient('public'));
    routeMocks.createPrivateClient.mockImplementation(async () => createClient('private'));
    routeMocks.getCurrentUserContext.mockImplementation(async () => ({
      isAuthenticated: routeMocks.state.isAdmin,
      isAdmin: routeMocks.state.isAdmin,
    }));
  });

  it('uses only the cookie-free client for a visible public vote', async () => {
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=2, stale-while-revalidate=5',
    );
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(routeMocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(routeMocks.createPrivateClient).not.toHaveBeenCalled();
    expect(routeMocks.lteCalls).toEqual([
      {
        access: 'public',
        table: 'vote',
        column: 'visible_at',
        value: expect.any(String),
      },
    ]);
    expect(Number.isFinite(Date.parse(String(routeMocks.lteCalls[0]?.value)))).toBe(true);
  });

  it.each([
    null,
    '2099-01-01T00:00:00.000Z',
  ])('checks admin only after the public lookup hides visible_at=%s', async (visibleAt) => {
    routeMocks.state.vote!.visible_at = visibleAt;

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Vote not found' });
    expect(routeMocks.getCurrentUserContext).toHaveBeenCalledTimes(1);
    expect(routeMocks.createPrivateClient).not.toHaveBeenCalled();
    expect(routeMocks.fromCalls).toEqual([{ access: 'public', table: 'vote' }]);
  });

  it('allows an admin private re-read and preserves conditional 304 caching', async () => {
    routeMocks.state.isAdmin = true;
    routeMocks.state.vote!.visible_at = '2099-01-01T00:00:00.000Z';

    const first = await GET(request(), context);
    const etag = first.headers.get('etag');

    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    expect(etag).toBeTruthy();
    expect(routeMocks.createPrivateClient).toHaveBeenCalledTimes(1);

    const second = await GET(request({ 'if-none-match': etag! }), context);

    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
    expect(second.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('returns the stable response shape and ignores null/deleted rewards', async () => {
    const response = await GET(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
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
    expect(body.rewards).toHaveLength(1);
    expect(body.rewards[0].private_note).toBeUndefined();
  });

  it('locks the explicit select-column contract for vote, items, and rewards', async () => {
    await GET(request(), context);

    expect(normalizedSelect(routeMocks.selectCalls.get('public:vote')![0])).toMatchInlineSnapshot(
      `"area, areas, created_at, deleted_at, id, is_partnership, main_image, order, partner, result_image, star_candy_bonus_total, star_candy_total, start_at, stop_at, title, updated_at, visible_at, vote_category, vote_content, vote_sub_category, vote_total, wait_image"`,
    );
    expect(normalizedSelect(routeMocks.selectCalls.get('public:vote_item')![0])).toMatchInlineSnapshot(
      `"artist_id, created_at, deleted_at, group_id, id, star_candy_bonus_total, star_candy_total, updated_at, vote_id, vote_total, artist:artist_id ( birth_date, created_at, dd, debut_date, debut_dd, debut_mm, debut_yy, deleted_at, gender, group_id, id, image, is_kpop, is_musical, is_partnership, is_solo, mm, name, partner, partner_data, updated_at, yy, artistGroup:group_id ( created_at, debut_date, debut_dd, debut_mm, debut_yy, deleted_at, id, image, name, updated_at ) )"`,
    );
    expect(normalizedSelect(routeMocks.selectCalls.get('public:vote_reward')![0])).toMatchInlineSnapshot(
      `"reward_id, reward:reward_id ( created_at, deleted_at, id, location, location_images, order, overview_images, size_guide, size_guide_images, thumbnail, title, updated_at )"`,
    );
  });

  it('returns 500 and logs an unexpected public vote query error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    routeMocks.state.publicVoteError = { code: 'XX000', message: 'database failure' };

    const response = await GET(request(), context);

    expect(response.status).toBe(500);
    expect(routeMocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns 404 only for PGRST116 after an admin private re-read', async () => {
    routeMocks.state.isAdmin = true;
    routeMocks.state.vote = null;

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(routeMocks.createPrivateClient).toHaveBeenCalledTimes(1);
  });

  it('returns 500 for a non-PGRST116 private re-read error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    routeMocks.state.isAdmin = true;
    routeMocks.state.vote!.visible_at = '2099-01-01T00:00:00.000Z';
    routeMocks.state.privateVoteError = { code: '42501', message: 'permission denied' };

    const response = await GET(request(), context);

    expect(response.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
