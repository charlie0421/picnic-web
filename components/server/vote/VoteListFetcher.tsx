import { createClient } from '@/utils/supabase-server-client';
import { buildVoteQuery, formatVoteData } from '@/utils/vote-data-formatter';
import { VoteListPresenter, VoteFilterSection } from '@/components/client/vote/list';
import { VOTE_STATUS, VOTE_AREAS, VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import { Vote } from '@/types/interfaces';

// 실제 Supabase에서 데이터를 가져오는 함수
async function fetchVotes(status: VoteStatus, area: VoteArea): Promise<Vote[]> {
  try {
    const supabase = await createClient();
    
    // 공통 쿼리 빌더 사용
    const query = buildVoteQuery(supabase, status, area);
    const { data: voteData, error } = await query;
    
    if (error) {
      console.error('Vote fetch error:', error);
      return [];
    }
    
    if (!voteData || voteData.length === 0) {
      return [];
    }
    
    // 공통 포맷터 사용
    return formatVoteData(voteData);
  } catch (error) {
    console.error('Unexpected error in fetchVotes:', error);
    return [];
  }
}

interface VoteListFetcherProps {
  status?: VoteStatus;
  area?: VoteArea;
  className?: string;
  enablePagination?: boolean;
  pageSize?: number;
}

export async function VoteListFetcher({ 
  status = VOTE_STATUS.ONGOING,
  area = VOTE_AREAS.ALL,
  className,
  enablePagination = true,
  pageSize = 12
}: VoteListFetcherProps) {
  // 선택된 status와 area에 해당하는 투표만 가져오기
  const votes = await fetchVotes(status, area);
  
  return (
    <div className={className}>
      {/* 필터 섹션 */}
      <VoteFilterSection />
      
      {/* 투표 리스트 */}
      <VoteListPresenter 
        votes={votes}
        hasMore={enablePagination && votes.length >= pageSize}
        isLoading={false}
      />
    </div>
  );
} 