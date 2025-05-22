import React, { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRewardById, getRewards } from '@/utils/api/queries';
import { createPageMetadata, createImageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createProductSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils';
import RewardDetailClient from '@/components/features/reward/RewardDetailClient';
import { LoadingState } from '@/components/server';

// ISR을 위한 메타데이터 구성 (30초마다 재검증)
export const revalidate = 30;

// ISR 메타데이터 사용
export const metadata = createISRMetadata(30);

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
  const reward = await getRewardById(params.id);

  if (!reward) {
    return createPageMetadata(
      '리워드 - 정보 없음',
      '해당 리워드를 찾을 수 없습니다.'
    );
  }

  let title: string;
  if (typeof reward.title === 'string') {
    title = reward.title;
  } else if (reward.title && typeof reward.title === 'object') {
    const titleObj = reward.title as { ko?: string; en?: string };
    title = titleObj.ko || titleObj.en || '리워드';
  } else {
    title = '리워드';
  }

  const description = typeof reward.description === 'string' 
    ? reward.description 
    : '피크닉에서 제공하는 특별한 리워드입니다.';
  
  // 기본 메타데이터
  const baseMetadata = createPageMetadata(
    `${title} - 피크닉 리워드`,
    description,
    {
      alternates: {
        canonical: `${SITE_URL}/${params.lang}/rewards/${params.id}`,
        languages: {
          'ko-KR': `${SITE_URL}/ko/rewards/${params.id}`,
          'en-US': `${SITE_URL}/en/rewards/${params.id}`,
        },
      },
    }
  );

  // 대표 이미지가 있는 경우 이미지 메타데이터 추가
  const mainImage = reward.mainImage || (reward.overviewImages?.length > 0 ? reward.overviewImages[0] : null);
  
  if (mainImage) {
    const imageMetadata = createImageMetadata(
      mainImage,
      title,
      1200,
      630
    );
    
    return {
      ...baseMetadata,
      ...imageMetadata,
    };
  }

  return baseMetadata;
}

type RewardDetailPageProps = {
  params: {
    id: string;
    lang: string;
  };
  searchParams: { [key: string]: string | string[] | undefined };
};

export default async function RewardDetailPage({ params }: RewardDetailPageProps) {
  // 서버에서 데이터 가져오기
  const reward = await getRewardById(params.id);

  // 리워드가 존재하지 않는 경우 404 페이지로 이동
  if (!reward) {
    notFound();
  }

  // 구조화된 데이터를 위한 정보 준비
  let title: string;
  if (typeof reward.title === 'string') {
    title = reward.title;
  } else if (reward.title && typeof reward.title === 'object') {
    const titleObj = reward.title as { ko?: string; en?: string };
    title = titleObj.ko || titleObj.en || '리워드';
  } else {
    title = '리워드';
  }

  const description = typeof reward.description === 'string' 
    ? reward.description 
    : '피크닉에서 제공하는 특별한 리워드입니다.';

  // 대표 이미지 찾기
  const mainImage = reward.mainImage || (reward.overviewImages?.length > 0 ? reward.overviewImages[0] : null);
  
  // 상품 구조화 데이터 생성
  const schemaData = createProductSchema(
    title,
    description,
    mainImage ? `https://cdn.picnic.fan/${mainImage}` : undefined,
    reward.price,
    'KRW',
    'InStock',
    `${SITE_URL}/${params.lang}/rewards/${params.id}`
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schemaData)
        }}
      />
      <Suspense fallback={<LoadingState message="리워드 정보를 불러오는 중..." />}>
        <RewardDetailClient reward={reward} />
      </Suspense>
    </>
  );
}
