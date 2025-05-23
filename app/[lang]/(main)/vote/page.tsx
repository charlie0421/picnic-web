import VotePageClient from '@/app/[lang]/(main)/vote/VotePageClient';
import { Metadata } from 'next';
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { getVotes } from '@/lib/data-fetching/vote-service';
import { VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore';
import { Vote } from '@/types/interfaces';

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

export default async function VotePage() {
  console.log('[VotePage] 서버 컴포넌트 렌더링 시작');

  // 초기 투표 데이터를 서버에서 가져옵니다
  let initialVotes: Vote[] = [];
  try {
    console.log('[VotePage] getVotes 호출 전');
    initialVotes = await getVotes(VOTE_STATUS.ONGOING, VOTE_AREAS.KPOP);
    console.log(
      '[VotePage] getVotes 호출 후, 데이터 개수:',
      initialVotes.length,
    );

    // 데이터가 있는지 확인
    if (initialVotes.length > 0) {
      // 투표 항목(voteItem)이 있는지 확인
      const hasVoteItems = initialVotes.some(
        (vote) => vote.voteItem && vote.voteItem.length > 0,
      );
      console.log('[VotePage] 투표 항목 포함 여부:', hasVoteItems);

      // 첫 번째 투표 데이터에 대한 로그
      if (initialVotes[0]) {
        console.log('[VotePage] 첫 번째 투표 데이터:', {
          id: initialVotes[0].id,
          title: initialVotes[0].title,
          voteItemsCount: initialVotes[0].voteItem?.length || 0,
        });
      }
    }
  } catch (error) {
    console.error('[VotePage] 투표 데이터 로드 중 오류 발생:', error);
    // 오류가 발생했을 때 빈 배열 사용
    initialVotes = [];
  }

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
      <VotePageClient initialVotes={initialVotes} />
    </>
  );
}
