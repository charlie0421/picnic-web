import { beforeEach, describe, expect, it, vi } from 'vitest';

const contentMocks = vi.hoisted(() => ({
  getPopups: vi.fn(),
  getBanners: vi.fn(),
}));

vi.mock('@/utils/api/queries', () => ({
  getPopups: contentMocks.getPopups,
  getBanners: contentMocks.getBanners,
}));

import { GET as getPopups } from '@/app/api/popups/route';
import { GET as getBanners } from '@/app/api/banners/route';

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

describe('public popup and banner cache headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contentMocks.getPopups.mockResolvedValue([{ id: 1, title: 'popup' }]);
    contentMocks.getBanners.mockResolvedValue([{ id: 2, title: 'banner' }]);
  });

  it('caches successful popup responses without changing their JSON shape', async () => {
    const response = await getPopups();

    expect(contentMocks.getPopups).toHaveBeenCalledWith({ throwOnError: true });
    expect(response.headers.get('cache-control')).toBe(CACHE_CONTROL);
    expect(await response.json()).toEqual([{ id: 1, title: 'popup' }]);
  });

  it('caches successful banner responses without changing their JSON shape', async () => {
    const response = await getBanners();

    expect(contentMocks.getBanners).toHaveBeenCalledWith({ throwOnError: true });
    expect(response.headers.get('cache-control')).toBe(CACHE_CONTROL);
    expect(await response.json()).toEqual([{ id: 2, title: 'banner' }]);
  });

  it.each([
    ['popup', contentMocks.getPopups, getPopups],
    ['banner', contentMocks.getBanners, getBanners],
  ] as const)('returns a non-cacheable 500 when the %s query fails', async (_name, query, route) => {
    query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await route();

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
