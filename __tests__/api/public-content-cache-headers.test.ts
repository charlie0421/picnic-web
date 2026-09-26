import { beforeEach, describe, expect, it, vi } from 'vitest';

const contentMocks = vi.hoisted(() => ({
  getPopupsForRoute: vi.fn(),
  getBannersForRoute: vi.fn(),
}));

vi.mock('@/utils/api/queries', () => ({
  getPopups: contentMocks.getPopupsForRoute,
  getBanners: contentMocks.getBannersForRoute,
}));

vi.mock('@/utils/api/queries-content', () => ({
  getPopupsForRoute: contentMocks.getPopupsForRoute,
  getBannersForRoute: contentMocks.getBannersForRoute,
}));

import { GET as getPopups } from '@/app/api/popups/route';
import { GET as getBanners } from '@/app/api/banners/route';

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

describe('public popup and banner cache headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contentMocks.getPopupsForRoute.mockResolvedValue([{ id: 1, title: 'popup' }]);
    contentMocks.getBannersForRoute.mockResolvedValue([{ id: 2, title: 'banner' }]);
  });

  it('caches successful popup responses without changing their JSON shape', async () => {
    const response = await getPopups();

    expect(contentMocks.getPopupsForRoute).toHaveBeenCalledWith();
    expect(response.headers.get('cache-control')).toBe(CACHE_CONTROL);
    expect(await response.json()).toEqual([{ id: 1, title: 'popup' }]);
  });

  it('caches successful banner responses without changing their JSON shape', async () => {
    const response = await getBanners();

    expect(contentMocks.getBannersForRoute).toHaveBeenCalledWith();
    expect(response.headers.get('cache-control')).toBe(CACHE_CONTROL);
    expect(await response.json()).toEqual([{ id: 2, title: 'banner' }]);
  });

  it.each([
    ['popup', contentMocks.getPopupsForRoute, getPopups],
    ['banner', contentMocks.getBannersForRoute, getBanners],
  ] as const)('preserves the non-cacheable empty-array contract when the %s query fails', async (_name, query, route) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await route();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
