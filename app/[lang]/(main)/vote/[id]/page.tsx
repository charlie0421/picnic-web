import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getVoteById, getVotes } from '@/lib/data-fetching/vote-service';
import { VoteDetail } from '@/components/shared';
import { VoteDetailSkeleton } from '@/components/server';
import { createISRMetadata } from '@/app/[lang]/utils/rendering-utils';
import {
  createPageMetadata,
  createImageMetadata,
} from '@/app/[lang]/utils/metadata-utils';
import { createVoteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';

// ISR을 위한 메타데이터 구성 (30초마다 재검증)
export const revalidate = 30;

// 동적 서버 사용 설정 제거 (ISR 사용)
// export const dynamic = 'force-dynamic';

// 정적 경로 생성
export async function generateStaticParams() {
  // 활성화된 투표만 사전 생성
  const votes = await getVotes('ongoing');

  return votes.map((vote) => ({
    id: String(vote.id),
  }));
}

// 메타데이터 동적 생성
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { id, lang: langParam } = await params;
  const lang = String(langParam || 'ko');

  // ISR 메타데이터 속성 추가
  const isrOptions = createISRMetadata(30);

  const vote = await getVoteById(id);

  if (!vote) {
    return {
      ...createPageMetadata(
        '투표 - 정보 없음',
        '해당 투표를 찾을 수 없습니다.',
      ),
      ...isrOptions,
    };
  }

  let title: string;
  if (typeof vote.title === 'string') {
    title = vote.title;
  } else if (vote.title && typeof vote.title === 'object') {
    const titleObj = vote.title as { ko?: string; en?: string };
    title = titleObj.ko || titleObj.en || '투표';
  } else {
    title = '투표';
  }

  const description =
    vote.voteContent || '피크닉에서 좋아하는 아티스트에게 투표해보세요!';

  // 기본 메타데이터
  const baseMetadata = createPageMetadata(
    `${title} - 피크닉 투표`,
    description,
    {
      alternates: {
        canonical: `${SITE_URL}/${lang}/vote/${id}`,
        languages: {
          'ko-KR': `${SITE_URL}/ko/vote/${id}`,
          'en-US': `${SITE_URL}/en/vote/${id}`,
        },
      },
    },
  );

  // 이미지가 있는 경우 이미지 메타데이터 추가
  if (vote.mainImage) {
    const imageMetadata = createImageMetadata(vote.mainImage, title, 1200, 630);

    return {
      ...baseMetadata,
      ...imageMetadata,
      ...isrOptions,
    };
  }

  return {
    ...baseMetadata,
    ...isrOptions,
  };
}

// PageProps 타입 생략, 직접 함수 파라미터에 타입을 인라인으로 정의
export default async function VoteDetailPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { id, lang: langParam } = await params;
  const lang = String(langParam || 'ko');

  const vote = await getVoteById(id);

  // 구조화된 데이터를 위한 정보 준비
  let schemaData: any = null;

  if (vote) {
    let title: string;
    if (typeof vote.title === 'string') {
      title = vote.title;
    } else if (vote.title && typeof vote.title === 'object') {
      const titleObj = vote.title as { ko?: string; en?: string };
      title = titleObj.ko || titleObj.en || '투표';
    } else {
      title = '투표';
    }

    const description =
      vote.voteContent || '피크닉에서 좋아하는 아티스트에게 투표해보세요!';

    schemaData = createVoteSchema(
      title,
      description,
      vote.mainImage ? `https://cdn.picnic.fan/${vote.mainImage}` : undefined,
      vote.startAt || undefined,
      vote.stopAt || undefined,
      `${SITE_URL}/${lang}/vote/${id}`,
    );
  }

  return (
    <>
      {schemaData && (
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schemaData),
          }}
        />
      )}
      <Suspense fallback={<VoteDetailSkeleton />}>
        <VoteDetail id={id} />
      </Suspense>
    </>
  );
}
