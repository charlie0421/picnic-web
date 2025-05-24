import { Vote, VoteItem, VoteFilter } from '../types';
import { VoteDetailPresenter } from '../client/VoteDetailPresenter';

// 실제 구현에서는 Supabase나 API에서 데이터를 가져옵니다
async function fetchVoteDetail(id: string): Promise<{
  vote: Vote | null;
  items: VoteItem[];
  rewards: any[]; // TODO: Reward 타입 정의
}> {
  // TODO: Implement actual data fetching
  // const supabase = createServerSupabaseClient();
  // const { data: vote } = await supabase
  //   .from('votes')
  //   .select('*')
  //   .eq('id', id)
  //   .single();
  
  // const { data: items } = await supabase
  //   .from('vote_items')
  //   .select('*')
  //   .eq('voteId', id)
  //   .order('voteCount', { ascending: false });
  
  // 임시 데이터
  return {
    vote: null,
    items: [],
    rewards: []
  };
}

export interface VoteDetailFetcherProps {
  id: string;
  className?: string;
}

export async function VoteDetailFetcher({ id, className }: VoteDetailFetcherProps) {
  const { vote, items, rewards } = await fetchVoteDetail(id);
  
  if (!vote) {
    return (
      <div className="bg-red-100 text-red-700 p-4 rounded-md">
        투표 정보를 찾을 수 없습니다.
      </div>
    );
  }
  
  return (
    <VoteDetailPresenter 
      vote={vote}
      initialItems={items}
      rewards={rewards}
      className={className}
    />
  );
} 