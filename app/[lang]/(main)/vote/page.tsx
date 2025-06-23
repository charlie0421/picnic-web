import { Metadata } from 'next';
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { BannerListFetcher, BannerSkeleton, VoteListSkeleton } from '@/components/server';
import { Suspense } from 'react';
import { VoteListFetcher } from '@/components/server/vote/VoteListFetcher';
import { VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore';

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
    '피크닉에서 좋아하는 아티스트에게 투표하고 응원하세요.',
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
}

export default async function VoteListPage({
  searchParams,
}: VoteListPageProps) {
  // URL 파라미터에서 status와 area 가져오기
  const resolvedSearchParams = await searchParams;
  const status = resolvedSearchParams.status || VOTE_STATUS.ONGOING;
  const area = resolvedSearchParams.area || VOTE_AREAS.ALL;

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createWebsiteSchema(
              `${SITE_URL}/vote`,
              '피크닉 투표',
              '피크닉에서 좋아하는 아티스트에게 투표하고 응원하세요.',
            ),
          ),
        }}
      />
      <main className='container mx-auto px-4 py-8 space-y-8'>
        {/* 배너 섹션 */}
        <section>
          <Suspense fallback={<BannerSkeleton />}>
            <BannerListFetcher />
          </Suspense>
        </section>

        {/* 투표 섹션 */}
        <section>
          <Suspense fallback={<VoteListSkeleton />}>
            <VoteListFetcher
              className='w-full'
              status={status as any}
              area={area as any}
            />
          </Suspense>
        </section>
      </main>
    </>
  );
}
