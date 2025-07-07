import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRewardById } from '@/lib/data-fetching/reward-service';
import { getRewards } from '@/utils/api/queries';
import {
  createPageMetadata,
  createImageMetadata,
} from '@/app/[lang]/utils/metadata-utils';
import { createProductSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils';
import RewardDetailClient from '@/components/client/reward/RewardDetailClient';

// ISR을 위한 메타데이터 구성 (30초마다 재검증)
export const revalidate = 30;

// ISR 메타데이터 사용
// export const metadata = createISRMetadata(30);

// 정적 경로 생성
export async function generateStaticParams() {
  try {
    // 활성화된 리워드만 사전 생성
    const rewards = await getRewards();

    return rewards.slice(0, 10).map((reward) => ({
      id: String(reward.id),
    }));
  } catch (error) {
    console.error('generateStaticParams 에러:', error);
    return [];
  }
}

// 메타데이터 동적 생성
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}): Promise<Metadata> {
  const { id: rewardId } = await params;

  try {
    const reward = await getRewardById(rewardId);

    if (!reward) {
      return createPageMetadata(
        '리워드를 찾을 수 없습니다',
        '요청하신 리워드가 존재하지 않습니다.',
      );
    }

    // reward.title, reward.description이 Json 타입이므로 문자열로 변환
    const title =
      typeof reward.title === 'string'
        ? reward.title
        : reward.title && typeof reward.title === 'object'
        ? (reward.title as any)?.ko || (reward.title as any)?.en || '리워드'
        : '리워드';

    const imageUrl = reward.thumbnail || '';
    const url = `${SITE_URL}/rewards/${rewardId}`;

    const metadata: Metadata = {
      ...createPageMetadata(`${title}`, '리워드 상세 페이지'),
      ...createImageMetadata(imageUrl, title, 1200, 630),
      openGraph: {
        title: `${title} | Picnic 리워드`,
        url,
        images: [{ url: imageUrl, alt: title }],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} | Picnic 리워드`,
        images: [{ url: imageUrl, alt: title }],
      },
      alternates: {
        canonical: url,
      },
    };

    // 스키마 데이터는 별도로 처리 (Metadata 타입에 없음)
    return metadata;
  } catch (error) {
    return createPageMetadata(
      '리워드 정보 로딩 중 오류',
      '리워드 정보를 불러오는 중 오류가 발생했습니다.',
    );
  }
}

// PageProps 타입 생략, 직접 함수 파라미터에 타입을 인라인으로 정의
export default async function RewardDetailPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  const { id: rewardId } = await params;

  try {
    console.log(`[RewardDetailPage] 리워드 ID ${rewardId} 요청 시작`);
    
    const reward = await getRewardById(rewardId);
    
    console.log(`[RewardDetailPage] 리워드 ID ${rewardId} 조회 결과:`, reward ? '성공' : '없음');

    if (!reward) {
      console.log(`[RewardDetailPage] 리워드 ID ${rewardId} 찾을 수 없음 - 404로 리디렉션`);
      notFound(); // 404 페이지로 리디렉션
    }

    return (
      <main className='flex flex-col min-h-screen bg-gray-50'>
        <Suspense fallback={<div className="p-8 text-center">로딩 중...</div>}>
          <RewardDetailClient reward={reward} />
        </Suspense>
      </main>
    );
  } catch (error) {
    // 상세한 에러 로깅
    console.error(`[RewardDetailPage] 리워드 ID ${rewardId} 처리 중 에러:`, {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      rewardId,
    });

    // 프로덕션에서는 사용자에게 친화적인 에러 페이지 표시
    if (process.env.NODE_ENV === 'production') {
      // 404로 처리하여 500 에러 방지
      notFound();
    } else {
      // 개발 환경에서는 에러를 그대로 throw하여 디버깅 가능
      throw error;
    }
  }
}
