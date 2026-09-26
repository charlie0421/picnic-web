import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageMocks = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(),
  getVotes: vi.fn(),
  getBanners: vi.fn(),
}));

vi.mock('@/components/server', () => ({
  BannerListFetcher: () => null,
  BannerSkeleton: () => null,
  VoteListSkeleton: () => null,
}));

vi.mock('@/components/server/vote/VoteListFetcher', () => ({
  VoteListFetcher: () => null,
}));

vi.mock('@/lib/i18n/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/app/[lang]/utils/metadata-utils', () => ({
  brandName: () => 'Picnic',
  buildLanguageAlternates: () => ({}),
  createPageMetadata: vi.fn(() => ({})),
}));

vi.mock('@/app/[lang]/utils/seo-utils', () => ({
  createWebsiteSchema: vi.fn(() => ({})),
}));

vi.mock('@/utils/api/queries', () => ({
  getBanners: pageMocks.getBanners,
}));

vi.mock('@/lib/data-fetching/server/supabase-service', () => ({
  getCurrentUserContext: pageMocks.getCurrentUserContext,
}));

vi.mock('@/lib/data-fetching/server/vote-service', () => ({
  getVotes: pageMocks.getVotes,
}));

import VoteListPage from '@/app/[lang]/(main)/vote/page';

const renderPage = (status: string) => VoteListPage({
  searchParams: Promise.resolve({ status, area: 'all' }),
  params: Promise.resolve({ lang: 'ko' }),
});

describe('vote list page user-context cost guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageMocks.getBanners.mockResolvedValue([]);
    pageMocks.getVotes.mockResolvedValue([]);
    pageMocks.getCurrentUserContext.mockResolvedValue({ isAuthenticated: false });
  });

  it('starts a public vote query without resolving user context', async () => {
    await renderPage('ongoing');
    await vi.waitFor(() => {
      expect(pageMocks.getVotes).toHaveBeenCalled();
    });

    expect(pageMocks.getCurrentUserContext).not.toHaveBeenCalled();
    expect(pageMocks.getVotes).toHaveBeenCalledWith('ongoing', 'all', 1, 12);
  });

  it('keeps the admin guard and downgrades a non-admin request', async () => {
    await renderPage('admin');
    await vi.waitFor(() => {
      expect(pageMocks.getVotes).toHaveBeenCalled();
    });

    expect(pageMocks.getCurrentUserContext).toHaveBeenCalledTimes(1);
    expect(pageMocks.getVotes).toHaveBeenCalledWith('ongoing', 'all', 1, 12);
  });
});
