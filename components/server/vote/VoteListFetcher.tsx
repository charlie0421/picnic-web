import { VoteListPresenter, VoteFilterSection } from '@/components/client/vote/list';
import { VOTE_STATUS, VOTE_AREAS, VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import { getVotes } from '@/lib/data-fetching/server/vote-service';

interface VoteListFetcherProps {
  status: VoteStatus;
  area: VoteArea;
  className?: string;
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
  className 
}: VoteListFetcherProps) {
  const votes = await getVotes(status, area);
  
  return (
    <div className={className}>
      <VoteFilterSection />
      <VoteListPresenter votes={votes} />
    </div>
  );
}
 