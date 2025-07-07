import { notFound } from 'next/navigation';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server';
import { Vote, VoteItem } from '@/types/interfaces';

interface VoteDetailFetcherProps {
  voteId: string;
  className?: string;
}

/**
 * 투표 상세 데이터를 서버에서 가져오는 컴포넌트
 */
export async function VoteDetailFetcher({
  voteId,
  className,
}: VoteDetailFetcherProps) {
  const supabase = createServerSupabaseClient();

  try {
    // voteId를 숫자로 변환
    const numericVoteId = parseInt(voteId, 10);
    if (isNaN(numericVoteId)) {
      console.error('Invalid vote ID:', voteId);
      notFound();
    }

    // 🚀 서버에서 사용자 정보도 함께 가져오기 (성능 개선)
    const user = await getServerUser();

    // 병렬로 모든 데이터 조회 (성능 최적화)
    const [
      { data: vote, error: voteError },
      { data: voteItems, error: itemsError },
      { data: rewards },
      { data: userVotes }
    ] = await Promise.all([
      // 투표 정보 조회
      supabase
        .from('vote')
        .select('*')
        .eq('id', numericVoteId)
        .single(),

      // 투표 아이템들 조회  
      supabase
        .from('vote_item')
        .select(`
          *,
          artist:artist_id (
            id,
            name,
            image
          )
        `)
        .eq('vote_id', numericVoteId)
        .order('vote_total', { ascending: false }),

      // 리워드 정보 조회
      supabase
        .from('reward')
        .select('*')
        .eq('vote_id', numericVoteId),

      // 🚀 사용자 투표 상태도 서버에서 미리 조회 (클라이언트 쿼리 제거)
      user ? supabase
        .from('vote_pick')
        .select('vote_item_id, amount, created_at')
        .eq('vote_id', numericVoteId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }) : Promise.resolve({ data: null })
    ]);

    if (voteError || !vote) {
      console.error('Vote fetch error:', voteError);
      notFound();
    }

    if (itemsError) {
      console.error('Vote items fetch error:', itemsError);
      throw new Error('Failed to fetch vote items');
    }

    console.log(`[VoteDetailFetcher] 서버 데이터 로드 완료: ${voteItems?.length || 0}개 아이템, ${userVotes?.length || 0}개 사용자 투표`);

    // 클라이언트 컴포넌트에 모든 초기 데이터 전달
    return (
      <HybridVoteDetailPresenter
        vote={vote as Vote}
        initialItems={(voteItems || []) as unknown as VoteItem[]}
        rewards={rewards || []}
        initialUser={user}
        initialUserVotes={userVotes || []}
        className={className}
        enableRealtime={true}
        pollingInterval={1000}
        maxRetries={3}
      />
    );
  } catch (error) {
    console.error('VoteDetailFetcher error:', error);
    notFound();
  }
}
