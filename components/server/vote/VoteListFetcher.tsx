import { createClient } from '@/utils/supabase-server-client';
import { buildVoteQuery, formatVoteData } from '@/utils/vote-data-formatter';
import { VoteListPresenter } from '@/components/client/vote/list/VoteListPresenter';
import { VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore';
import { Vote } from '@/types/interfaces';
import { VoteFilter } from '@/components/features_backup/vote';

// 실제 Supabase에서 데이터를 가져오는 함수
async function fetchVotes(filter?: VoteFilter): Promise<Vote[]> {
  try {
    const supabase = await createClient();
    
    // 기본값 설정 - VoteFilter 타입에 맞춰 조정
    const status = filter?.status || VOTE_STATUS.ONGOING;
    const area = VOTE_AREAS.KPOP; // VoteFilter에 area가 없으므로 기본값 사용
    
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

export interface VoteListFetcherProps {
  filter?: VoteFilter;
  className?: string;
  onVoteClick?: (voteId: string | number) => void;
}

export async function VoteListFetcher({ 
  filter, 
  className,
  onVoteClick 
}: VoteListFetcherProps) {
  const votes = await fetchVotes(filter);
  
  return (
    <VoteListPresenter 
      votes={votes} 
      filter={filter}
      className={className}
      onVoteClick={onVoteClick}
    />
  );
} 