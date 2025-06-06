import { notFound } from 'next/navigation';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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

    // 투표 정보 조회
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('*')
      .eq('id', numericVoteId)
      .single();

    if (voteError || !vote) {
      console.error('Vote fetch error:', voteError);
      notFound();
    }

    // 투표 아이템들 조회
    const { data: voteItems, error: itemsError } = await supabase
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
      .order('vote_total', { ascending: false });

    if (itemsError) {
      console.error('Vote items fetch error:', itemsError);
      throw new Error('Failed to fetch vote items');
    }

    // 리워드 정보 조회
    const { data: rewards } = await supabase
      .from('reward')
      .select('*')
      .eq('vote_id', numericVoteId);

    // 클라이언트 컴포넌트에 데이터 전달
    return (
      <HybridVoteDetailPresenter
        vote={vote as Vote}
        initialItems={(voteItems || []) as unknown as VoteItem[]}
        rewards={rewards || []}
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
