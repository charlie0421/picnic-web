import { VoteFilterSectionDeferred, VoteListCSR } from '@/components/client/vote/list';
import { VOTE_STATUS, VOTE_AREAS, VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';
import { getVotes } from '@/lib/data-fetching/server/vote-service';
import { Vote } from '@/types/interfaces';

interface VoteListFetcherProps {
  status: VoteStatus;
  area: VoteArea;
  className?: string;
  locale?: string;
  prefetchedVotesPromise?: Promise<Vote[]>;
  safeStatusOverride?: Promise<VoteStatus> | VoteStatus;
}

/**
 * 서버 컴포넌트: 투표 데이터를 서버에서 페칭하여 클라이언트 컴포넌트에 전달
 * 
 * 장점:
 * - 초기 페이지 로드 시 빠른 렌더링 (서버에서 데이터 포함)
 * - SEO 최적화 (크롤러가 투표 내용 인덱싱 가능)
 * - 클라이언트 번들 크기 감소
 * 
 * 사용법:
 * ```tsx
 * <VoteListFetcher status="ongoing" area="all" className="my-4" />
 * ```
 */
export async function VoteListFetcher({
  status = VOTE_STATUS.ONGOING,
  area = VOTE_AREAS.ALL,
  className,
  locale,
  prefetchedVotesPromise,
  safeStatusOverride,
}: VoteListFetcherProps) {
  // Admin 보호: status가 admin인 경우 서버에서 관리자 권한 확인
  let safeStatus: VoteStatus;
  if (safeStatusOverride) {
    safeStatus = await safeStatusOverride;
  } else {
    const userContext = await getCurrentUserContext();
    const isAdmin = (userContext as any)?.isAdmin === true;
    safeStatus =
      status === VOTE_STATUS.ADMIN
        ? (isAdmin ? VOTE_STATUS.ADMIN : VOTE_STATUS.ONGOING)
        : status;
  }

  // 초기에는 1페이지만 로드 (CSR 더보기/무한스크롤이 이어받음)
  const votes = prefetchedVotesPromise
    ? await prefetchedVotesPromise
    : await getVotes(safeStatus, area, 1, 12);
  
  return (
    <div className={className}>
      <VoteFilterSectionDeferred />
      <VoteListCSR initialVotes={votes} initialLocale={locale} />
    </div>
  );
}
 