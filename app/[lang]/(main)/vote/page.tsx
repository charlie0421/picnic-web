export const revalidate = 60;
import { Suspense } from 'react';
import { Metadata } from 'next';
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { BannerListFetcher, BannerSkeleton, VoteListSkeleton } from '@/components/server';
import { VoteListFetcher } from '@/components/server/vote/VoteListFetcher';
import {
  VOTE_STATUS,
  VoteStatus,
  normalizeVoteStatus,
  normalizeVoteArea,
} from '@/stores/voteFilterStore';
import { getBanners } from '@/utils/api/queries';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';
import { getVotes } from '@/lib/data-fetching/server/vote-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { lang: langParam } = await params;
  const lang = String(langParam || 'ko');

  return createPageMetadata(
    '투표',
    '피크닠에서 좋아하는 아티스트에게 투표하고 응원하세요.',
    {
      alternates: {
        canonical: `${SITE_URL}/${lang}/vote`,
        languages: {
          'ko-KR': `${SITE_URL}/ko/vote`,
          'en-US': `${SITE_URL}/en/vote`,
        },
      },
    },
  );
}

interface VoteListPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  params: Promise<{ lang: string }>;
}

export default async function VoteListPage({
  searchParams,
  params,
}: VoteListPageProps) {
  // URL 파라미터에서 status와 area 가져오기
  const [resolvedSearchParams, resolvedParams] = await Promise.all([searchParams, params]);
  // 신뢰 경계 — 알 수 없는 값은 여기서 기본값으로 좁힌다. 그래야 필터 UI 표시와
  // 실제 쿼리가 어긋나지 않는다 (?status=bogus 가 날짜 필터를 통째로 건너뛰던 문제).
  const status = normalizeVoteStatus(resolvedSearchParams.status);
  const area = normalizeVoteArea(resolvedSearchParams.area);
  const lang = resolvedParams?.lang || 'ko';

  const bannerPromise = (async () =>
    await (
      await getBanners({
        columns: `
          id,
          celeb_id,
          created_at,
          deleted_at,
          duration,
          end_at,
          image,
          link,
          link_target_id,
          link_type,
          location,
          "order",
          start_at,
          thumbnail,
          title,
          updated_at
        `,
      })
    ))();

  const userContextPromise = getCurrentUserContext();
  const safeStatusPromise: Promise<VoteStatus> = (async () => {
    const userContext = await userContextPromise;
    const isAdmin = (userContext as any)?.isAdmin === true;
    if (status === VOTE_STATUS.ADMIN) {
      return isAdmin ? VOTE_STATUS.ADMIN : VOTE_STATUS.ONGOING;
    }
    return status;
  })();

  const prefetchedVotesPromise = safeStatusPromise.then((safeStatus) =>
    getVotes(safeStatus, area, 1, 12),
  );

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createWebsiteSchema(
              `${SITE_URL}/vote`,
              '피크닠 투표',
              '피크닠에서 좋아하는 아티스트에게 투표하고 응원하세요.',
            ),
          ),
        }}
      />
      <main className='container mx-auto px-4 py-6 flex flex-col gap-8'>
        {/* 투표 섹션 - 우선 렌더 */}
        <section className='order-2'>
          <Suspense fallback={<VoteListSkeleton />}>
            <VoteListFetcher
              className='w-full'
              status={status as any}
              area={area as any}
              locale={lang}
              prefetchedVotesPromise={prefetchedVotesPromise}
              safeStatusOverride={safeStatusPromise}
            />
          </Suspense>
        </section>

        {/* 배너 섹션 */}
        <section className='vote-banner-section order-1'>
          <div className='relative w-full min-h-[180px]'>
            <Suspense
              fallback={
                <div className='h-full min-h-[inherit]'>
                  <BannerSkeleton className='h-full min-h-[inherit]' />
                </div>
              }
            >
              <BannerListFetcher
                className='h-full min-h-[inherit]'
                prefetchedBannersPromise={bannerPromise}
              />
            </Suspense>
          </div>
        </section>
      </main>
    </>
  );
}
