import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Vote, VoteItem } from '@/types/interfaces';

interface VoteDetailFetcherProps {
  voteId: string;
  className?: string;
}

/**
 * 투표 상세 데이터를 가져오는 서버 컴포넌트
 * vote-service를 사용하여 데이터를 조회합니다.
 */
export async function VoteDetailFetcher({
  voteId,
  className,
}: VoteDetailFetcherProps) {
  const supabase = createServerSupabaseClient();

  try {
    // voteId를 number로 변환
    const numericVoteId = parseInt(voteId, 10);
    if (isNaN(numericVoteId)) {
      console.error('Invalid vote ID:', voteId);
      notFound();
    }

    // 투표 정보 가져오기
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('*')
      .eq('id', numericVoteId)
      .single();

    if (voteError || !vote) {
      console.error('Vote fetch error:', voteError);
      notFound();
    }

    // 투표 아이템들 가져오기
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

    // 리워드 정보 가져오기 (있는 경우)
    const { data: rewards } = await supabase
      .from('reward')
      .select('*')
      .eq('vote_id', numericVoteId);

    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      }>
        <HybridVoteDetailPresenter
          vote={vote as Vote}
          initialItems={(voteItems || []) as unknown as VoteItem[]}
          rewards={rewards || []}
          className={className}
          enableRealtime={true}
          pollingInterval={1000}
          maxRetries={3}
        />
      </Suspense>
    );
  } catch (error) {
    console.error('VoteDetailFetcher error:', error);
    notFound();
  }
}
