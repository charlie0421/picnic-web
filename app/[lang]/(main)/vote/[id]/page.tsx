import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getVoteById, getVotes } from '@/lib/data-fetching/vote-service';
import { VoteDetail } from '@/components/client/vote';
import { VoteDetailFetcher, VoteDetailSkeleton } from '@/components/server';

import {
  createPageMetadata,
  createImageMetadata,
} from '@/app/[lang]/utils/metadata-utils';
import { createVoteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';

// ISR 활성화 (공개 클라이언트 사용으로 쿠키 의존성 제거)
export const revalidate = 30;

// 정적 경로 생성
export async function generateStaticParams() {
  try {
    // 활성화된 투표만 사전 생성
    const votes = await getVotes('ongoing');

    return votes.map((vote) => ({
      id: String(vote.id),
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
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { id, lang: langParam } = await params;
  const lang = String(langParam || 'ko');

  const vote = await getVoteById(id);

  if (!vote) {
    return createPageMetadata(
      '투표 - 정보 없음',
      '해당 투표를 찾을 수 없습니다.',
    );
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
    vote.vote_content || '피크닠에서 좋아하는 아티스트에게 투표해보세요!';

  // 기본 메타데이터
  const baseMetadata = createPageMetadata(
    `${title} - 피크닠 투표`,
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
  if (vote.main_image) {
    const imageMetadata = createImageMetadata(
      vote.main_image,
      title,
      1200,
      630,
    );

    return {
      ...baseMetadata,
      ...imageMetadata,
    };
  }

  return baseMetadata;
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

  console.log('[VoteDetailPage] 페이지 시작 - ID:', id, 'Lang:', lang);
  console.log('[VoteDetailPage] 환경 변수 체크:');
  console.log(
    '  - NEXT_PUBLIC_SUPABASE_URL:',
    process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '설정되지 않음',
  );
  console.log(
    '  - NEXT_PUBLIC_SUPABASE_ANON_KEY:',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '설정됨' : '설정되지 않음',
  );

  const vote = await getVoteById(id);

  // 투표가 없으면 404 페이지로 이동
  if (!vote) {
    console.log('[VoteDetailPage] 투표 없음 - notFound 호출');
    notFound();
  }

  console.log('[VoteDetailPage] 투표 데이터 로드 성공');

  // 구조화된 데이터를 위한 정보 준비
  let schemaData: any = null;

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
    vote.vote_content || '피크닠에서 좋아하는 아티스트에게 투표해보세요!';

  schemaData = createVoteSchema(
    title,
    description,
    vote.main_image ? `https://cdn.picnic.fan/${vote.main_image}` : undefined,
    vote.start_at || undefined,
    vote.stop_at || undefined,
    `${SITE_URL}/${lang}/vote/${id}`,
  );

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
        <VoteDetailFetcher voteId={id} />
      </Suspense>
    </>
  );
}
