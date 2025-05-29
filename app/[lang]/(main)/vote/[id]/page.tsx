import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getVoteById, getVotes } from '@/lib/data-fetching/vote-service';
import { VoteDetail } from '@/components/client/vote';
import { VoteDetailFetcher, VoteDetailSkeleton } from '@/components/server';

import {
  createLocalizedPageMetadata,
  createLocalizedJsonLd,
} from '@/app/[lang]/utils/metadata-utils';
import { createVoteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { Language } from '@/config/settings';

// 동적 서버 사용 설정 (쿠키 사용으로 인한 정적->동적 에러 방지)
export const dynamic = 'force-dynamic';

// ISR 비활성화 (동적 페이지이므로)
// export const revalidate = 30;

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

// 투표 제목 추출 유틸리티 함수
function extractVoteTitle(voteTitle: any, language: Language): string {
  if (typeof voteTitle === 'string') {
    return voteTitle;
  }
  
  if (voteTitle && typeof voteTitle === 'object') {
    const titleObj = voteTitle as Record<string, string>;
    // 현재 언어 우선, 그 다음 한국어, 영어, 첫 번째 값 순으로 fallback
    return titleObj[language] || titleObj.ko || titleObj.en || Object.values(titleObj)[0] || '투표';
  }
  
  return language === 'ko' ? '투표' : 'Vote';
}

// 투표 설명 생성 유틸리티 함수
function generateVoteDescription(language: Language): string {
  const descriptions: Record<Language, string> = {
    ko: '피크닉에서 좋아하는 아티스트에게 투표해보세요!',
    en: 'Vote for your favorite artist on Picnic!',
    ja: 'ピクニックで好きなアーティストに投票しよう!',
    zh: '在野餐为你最喜欢的艺人投票！',
    id: 'Vote untuk artis favorit Anda di Picnic!',
  };
  
  return descriptions[language];
}

// 메타데이터 동적 생성
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { id, lang: langParam } = await params;
  const language = (langParam || 'ko') as Language;

  const vote = await getVoteById(id);

  if (!vote) {
    const notFoundTitle = language === 'ko' ? '투표 - 정보 없음' : 'Vote - Not Found';
    const notFoundDesc = language === 'ko' ? '해당 투표를 찾을 수 없습니다.' : 'The requested vote could not be found.';
    
    return createLocalizedPageMetadata(
      language,
      `/vote/${id}`,
      notFoundTitle,
      notFoundDesc
    );
  }

  const title = extractVoteTitle(vote.title, language);
  const siteTitle = language === 'ko' ? '피크닉 투표' : 'Picnic Vote';
  const fullTitle = `${title} - ${siteTitle}`;
  
  const description = vote.vote_content || generateVoteDescription(language);

  // 국제화된 메타데이터 생성
  return createLocalizedPageMetadata(
    language,
    `/vote/${id}`,
    fullTitle,
    description,
    {
      imageUrl: vote.main_image || undefined,
      keywords: language === 'ko' 
        ? ['투표', 'K-Pop', '아티스트', '팬덤', title]
        : ['Vote', 'K-Pop', 'Artist', 'Fandom', title],
    }
  );
}

// PageProps 타입 생략, 직접 함수 파라미터에 타입을 인라인으로 정의
export default async function VoteDetailPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { id, lang: langParam } = await params;
  const language = (langParam || 'ko') as Language;

  console.log('[VoteDetailPage] 페이지 시작 - ID:', id, 'Lang:', language);
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
  const title = extractVoteTitle(vote.title, language);
  const description = vote.vote_content || generateVoteDescription(language);
  
  // 투표 스키마 생성
  const voteSchemaData = createVoteSchema(
    title,
    description,
    vote.main_image ? `https://cdn.picnic.fan/${vote.main_image}` : undefined,
    vote.start_at || undefined,
    vote.stop_at || undefined,
    `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}vote/${id}`,
  );

  // 언어별 구조화된 데이터 생성
  const breadcrumbJsonLd = createLocalizedJsonLd(
    language,
    'BreadcrumbList',
    {
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: language === 'ko' ? '홈' : 'Home',
          item: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: language === 'ko' ? '투표' : 'Vote',
          item: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}vote`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: title,
          item: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}vote/${id}`,
        },
      ],
    }
  );

  return (
    <>
      {/* 투표 구조화된 데이터 */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(voteSchemaData),
        }}
      />
      
      {/* 브레드크럼 구조화된 데이터 */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd,
        }}
      />
      
      <Suspense fallback={<VoteDetailSkeleton />}>
        <VoteDetailFetcher voteId={id} />
      </Suspense>
    </>
  );
}
