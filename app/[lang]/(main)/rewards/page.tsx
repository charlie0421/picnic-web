import React, { Suspense } from 'react';
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils';
import { ClientNavigationSetter } from '@/components/client';
import { PortalType } from '@/utils/enums';
import { Metadata } from 'next';
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { RewardListFetcher } from '@/components/server/reward';
import { LoadingState } from '@/components/server';

// ISR을 위한 메타데이터 구성 (60초마다 재검증)
export const revalidate = 60;

// 페이지 메타데이터 정의
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { lang: langParam } = await params;
  const lang = String(langParam || 'ko');

  // ISR 메타데이터 속성 추가
  const isrOptions = createISRMetadata(60);

  return {
    ...createPageMetadata(
      '리워드 - 피크닠',
      '피크닠에서 제공하는 다양한 리워드를 확인해보세요.',
      {
        alternates: {
          canonical: `${SITE_URL}/${lang}/rewards`,
          languages: {
            'ko-KR': `${SITE_URL}/ko/rewards`,
            'en-US': `${SITE_URL}/en/rewards`,
          },
        },
      },
    ),
    ...isrOptions,
  };
}

// 서버 컴포넌트로 변환
export default async function RewardsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { lang: langParam } = await params;
  const lang = String(langParam || 'ko');

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createWebsiteSchema(
              `${SITE_URL}/rewards`,
              '피크닠 리워드',
              '피크닠에서 제공하는 다양한 리워드를 확인해보세요.',
            ),
          ),
        }}
      />
      <div className='container mx-auto px-4 py-6 space-y-10'>
        <Suspense fallback={<LoadingState message="미디어 데이터를 불러오는 중..." size="large" fullPage />}>
          <RewardListFetcher showViewAllLink={true} />
        </Suspense>

        {/* 클라이언트 포털 타입 설정 */}
        <ClientNavigationSetter portalType={PortalType.VOTE} />
      </div>
    </>
  );
}
