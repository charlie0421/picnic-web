import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRewardById } from '@/lib/data-fetching/server/reward-service';
import {
  brandName,
  createPageMetadata,
  createImageMetadata,
} from '@/app/[lang]/utils/metadata-utils';
import { getLocalizedString } from '@/utils/api/strings';
import { createProductSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import RewardDetailClient from '@/components/client/reward/RewardDetailClient';

// ISR: 요청 시 생성하고 5분마다 재생성한다. 없는 id 의 404 도 5분 뒤 다시 확인한다.
export const revalidate = 300;

// 빌드에서는 만들지 않는다 — 빈 목록이어야 [id] 가 요청 시 정적 생성(ISR) 대상이 된다.
export async function generateStaticParams() {
  return [];
}

// 조회 장애(getRewardById 의 예외)는 여기서도 페이지에서도 잡지 않는다.
// 이 라우트는 ISR 이라, 오류를 "오류 메타데이터" 나 404 로 바꿔 정상 렌더로 끝내면 그 결과가 5분간
// 캐시돼 정상 리워드를 덮는다. 예외로 끝나면 Next 가 마지막 정상 페이지를 계속 제공한다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}): Promise<Metadata> {
  const { id: rewardId, lang } = await params;

  const reward = await getRewardById(rewardId);

  if (!reward) {
    return createPageMetadata(
      '리워드를 찾을 수 없습니다',
      '요청하신 리워드가 존재하지 않습니다.',
    );
  }

  // reward.title, reward.description이 Json 타입이므로 문자열로 변환
  const title = getLocalizedString(reward.title as any, lang as any) || brandName(lang);

  const imageUrl = reward.thumbnail || '';
  const url = `${SITE_URL}/${lang}/rewards/${rewardId}`;

  return {
    ...createPageMetadata(`${title}`, `${title} - ${brandName(lang)}`, undefined, lang),
    ...createImageMetadata(imageUrl, title, 1200, 630),
    openGraph: {
      siteName: brandName(lang),
      title: `${title} | ${brandName(lang)}`,
      url,
      images: [{ url: imageUrl, alt: title }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${brandName(lang)}`,
      images: [{ url: imageUrl, alt: title }],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function RewardDetailPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  const { id: rewardId } = await params;

  // 예전에는 try/catch 가 프로덕션에서 모든 오류를 notFound() 로 바꿨다. 동적 렌더일 때는 그 요청만 404 였지만,
  // ISR 에서는 장애로 생긴 404 가 캐시에 저장된다. 실제로 없는 리워드(null)만 404 로 끝낸다.
  const reward = await getRewardById(rewardId);

  if (!reward) {
    notFound();
  }

  return (
    <main className='flex flex-col min-h-screen bg-gray-50'>
      <Suspense fallback={<div className="p-8 text-center">로딩 중...</div>}>
        <RewardDetailClient reward={reward} />
      </Suspense>
    </main>
  );
}
