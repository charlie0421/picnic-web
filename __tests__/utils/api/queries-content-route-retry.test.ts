import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeQueryMocks = vi.hoisted(() => {
  const popupOrder = vi.fn();
  const bannerOr = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === 'popup') {
      return {
        select: () => ({
          is: () => ({
            lte: () => ({
              or: () => ({ order: popupOrder }),
            }),
          }),
        }),
      };
    }

    if (table === 'banner') {
      return {
        select: () => ({
          is: () => ({
            eq: () => ({
              order: () => ({
                lte: () => ({ or: bannerOr }),
              }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { bannerOr, from, popupOrder };
});

vi.mock('@/lib/supabase/server', () => ({
  createPublicSupabaseClient: () => ({ from: routeQueryMocks.from }),
}));

vi.mock('@/utils/api/queries-helpers', () => ({
  FALLBACK_REWARDS: [],
  GET_REWARDS_TIMEOUT_MS: 7000,
  DEFAULT_REWARD_LIMIT: 24,
  REWARD_SELECT_COLUMNS: 'id',
  withTimeout: (promise: Promise<unknown>) => promise,
  logRequestError: vi.fn(),
}));

import {
  getBannersForRoute,
  getPopupsForRoute,
} from '@/utils/api/queries-content';

describe('public content route retry budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('limits popup route failures to one retry', async () => {
    const queryError = { message: 'popup database unavailable' };
    routeQueryMocks.popupOrder.mockResolvedValue({ data: null, error: queryError });

    const result = getPopupsForRoute();
    const rejection = expect(result).rejects.toBe(queryError);
    await vi.runAllTimersAsync();

    await rejection;
    expect(routeQueryMocks.from).toHaveBeenCalledTimes(2);
    expect(routeQueryMocks.popupOrder).toHaveBeenCalledTimes(2);
  });

  it('limits banner route failures to one retry', async () => {
    const queryError = { message: 'banner database unavailable' };
    routeQueryMocks.bannerOr.mockResolvedValue({ data: null, error: queryError });

    const result = getBannersForRoute();
    const rejection = expect(result).rejects.toBe(queryError);
    await vi.runAllTimersAsync();

    await rejection;
    expect(routeQueryMocks.from).toHaveBeenCalledTimes(2);
    expect(routeQueryMocks.bannerOr).toHaveBeenCalledTimes(2);
  });
});
