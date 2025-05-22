import React from 'react';
import RewardList from '@/components/features/reward/RewardList';
import {getRewards} from '@/utils/api/queries';
import {createISRMetadata} from '@/app/[lang]/utils/rendering-utils';
import {ClientNavigationSetter} from '@/components/client';
import {PortalType} from '@/utils/enums';
import { Metadata } from 'next';
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';

// ISR을 위한 메타데이터 구성 (60초마다 재검증)
export const revalidate = 60;

// 페이지 메타데이터 정의
export async function generateMetadata({
  params,
}: {
  params: { lang: string };
}): Promise<Metadata> {
  return createPageMetadata(
    '리워드 - 피크닉',
    '피크닉에서 제공하는 다양한 리워드를 확인해보세요.',
    {
      alternates: {
        canonical: `${SITE_URL}/${params.lang}/rewards`,
        languages: {
          'ko-KR': `${SITE_URL}/ko/rewards`,
          'en-US': `${SITE_URL}/en/rewards`,
        },
      },
    }
  );
}

// ISR 메타데이터 사용
export const metadata = createISRMetadata(60);

// 서버 컴포넌트로 변환
export default async function RewardsPage({
  params,
}: {
  params: { lang: string };
}) {
  // 서버에서 데이터 가져오기
  const rewards = await getRewards();
  
  // 데이터 가져오기 실패 시 오류 상태 표시
  if (!rewards || rewards.length === 0) {
    return (
      <div className='container mx-auto px-4 py-6'>
        <div className='bg-red-100 text-red-700 p-4 rounded-md'>
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
        
        {/* 클라이언트 포털 타입 설정 */}
        <ClientNavigationSetter portalType={PortalType.VOTE} />
      </div>
    );
  }
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createWebsiteSchema(
              `${SITE_URL}/rewards`,
              '피크닉 리워드',
              '피크닉에서 제공하는 다양한 리워드를 확인해보세요.'
            )
          ),
        }}
      />
      <div className='container mx-auto px-4 py-6 space-y-10'>
        <RewardList rewards={rewards} />
        
        {/* 클라이언트 포털 타입 설정 */}
        <ClientNavigationSetter portalType={PortalType.VOTE} />
      </div>
    </>
  );
}
