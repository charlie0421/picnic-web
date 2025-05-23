import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRewardById, getRewards } from '@/utils/api/queries';
import { createPageMetadata, createImageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createProductSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils';
import { LoadingState } from '@/components/server';
import RewardDetailClient from '@/components/features/reward/RewardDetailClient';

// ISR을 위한 메타데이터 구성 (30초마다 재검증)
export const revalidate = 30;

// ISR 메타데이터 사용
// export const metadata = createISRMetadata(30);

// 정적 경로 생성
export async function generateStaticParams() {
  // 활성화된 리워드만 사전 생성
  const rewards = await getRewards();
  
  return rewards.slice(0, 10).map(reward => ({
    id: String(reward.id)
  }));
}

// 메타데이터 동적 생성
export async function generateMetadata({
  params,
}: {
  params: { id: string; lang: string };
}): Promise<Metadata> {
  const rewardId = params.id;
  
  try {
    const reward = await getRewardById(rewardId);
    
    if (!reward) {
      return createPageMetadata({
        title: '리워드를 찾을 수 없습니다',
        description: '요청하신 리워드가 존재하지 않습니다.'
      });
    }
    
    const imageUrl = reward.image_url || '';
    const url = `${SITE_URL}/rewards/${rewardId}`;
    
    return {
      ...createPageMetadata({
        title: `${reward.title} | Picnic 리워드`,
        description: reward.description || '팬 활동에 대한 특별한 보상을 받아보세요!',
      }),
      ...createImageMetadata(imageUrl),
      openGraph: {
        title: `${reward.title} | Picnic 리워드`,
        description: reward.description || '팬 활동에 대한 특별한 보상을 받아보세요!',
        url,
        images: [{ url: imageUrl, alt: reward.title }],
        type: 'website'
      },
      twitter: {
        card: 'summary_large_image',
        title: `${reward.title} | Picnic 리워드`,
        description: reward.description || '팬 활동에 대한 특별한 보상을 받아보세요!',
        images: [{ url: imageUrl, alt: reward.title }],
      },
      alternates: {
        canonical: url,
      },
      schema: createProductSchema({
        name: reward.title,
        description: reward.description || '',
        image: imageUrl,
        url,
        price: reward.price ? `${reward.price}` : '무료',
        priceCurrency: 'KRW'
      })
    };
  } catch (error) {
    return createPageMetadata({
      title: '리워드 정보 로딩 중 오류',
      description: '리워드 정보를 불러오는 중 오류가 발생했습니다.'
    });
  }
}

// PageProps 타입 생략, 직접 함수 파라미터에 타입을 인라인으로 정의
export default async function RewardDetailPage({ 
  params 
}: { 
  params: { id: string; lang: string } 
}) {
  // ISR 메타데이터 설정 (증분 정적 재생성)
  createISRMetadata({
    revalidate: 30,
    dynamicParams: true
  });

  const rewardId = params.id;
  
  try {
    const reward = await getRewardById(rewardId);
    
    if (!reward) {
      notFound(); // 404 페이지로 리디렉션
    }
    
    return (
      <main className="flex flex-col min-h-screen bg-gray-50">
        <Suspense fallback={<LoadingState />}>
          <RewardDetailClient reward={reward} />
        </Suspense>
      </main>
    );
  } catch (error) {
    // 에러 발생 시 에러 경계로 전파
    throw error;
  }
}
