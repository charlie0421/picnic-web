import { notFound } from 'next/navigation';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { Vote, VoteItem } from '@/types/interfaces';

interface VoteDetailFetcherProps {
  voteId: string;
  className?: string;
}

/**
 * 투표 상세 데이터를 서버에서 가져오는 컴포넌트 (공개 데이터만)
 * 사용자 인증 관련 데이터는 클라이언트에서 처리하여 정적 렌더링 지원
 */
export async function VoteDetailFetcher({
  voteId,
  className,
}: VoteDetailFetcherProps) {
  // 🔧 정적 렌더링 지원: 공개 데이터 전용 클라이언트 사용 (쿠키 없음)
  const supabase = createPublicSupabaseClient();

  try {
    // voteId를 숫자로 변환
    const numericVoteId = parseInt(voteId, 10);
    if (isNaN(numericVoteId)) {
      console.error('Invalid vote ID:', voteId);
      notFound();
    }

    // 🚀 공개 데이터만 서버에서 조회 (정적 렌더링 가능)
    const [
      { data: vote, error: voteError },
      { data: voteItems, error: itemsError },
      { data: rewards }
    ] = await Promise.all([
      // 투표 정보 조회 (공개 데이터)
      supabase
        .from('vote')
        .select('*')
        .eq('id', numericVoteId)
        .single(),

      // 투표 아이템들 조회 (공개 데이터)
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

      // 리워드 정보 조회 (공개 데이터)
      supabase
        .from('reward')
        .select('*')
        .eq('vote_id', numericVoteId)
    ]);

    if (voteError || !vote) {
      console.error('Vote fetch error:', voteError);
      notFound();
    }

    if (itemsError) {
      console.error('Vote items fetch error:', itemsError);
      throw new Error('Failed to fetch vote items');
    }

    console.log(`[VoteDetailFetcher] 서버 공개 데이터 로드 완료: ${voteItems?.length || 0}개 아이템`);

    // ✨ 클라이언트 컴포넌트에 공개 데이터만 전달
    // 사용자 인증 정보와 투표 상태는 클라이언트에서 처리
    return (
      <HybridVoteDetailPresenter
        vote={vote as Vote}
        initialItems={(voteItems || []) as unknown as VoteItem[]}
        rewards={rewards || []}
        initialUser={null} // 클라이언트에서 로드
        initialUserVotes={[]} // 클라이언트에서 로드
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
