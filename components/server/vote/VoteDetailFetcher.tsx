import 'server-only';
import React from 'react';
import { notFound } from 'next/navigation';
import { Vote, VoteItem, Reward } from '@/types/interfaces';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { getVoteById, getVoteItems, getVoteRewards } from '@/utils/api/queries';

export interface VoteDetailFetcherProps {
  voteId: string;
  className?: string;
}

export default async function VoteDetailFetcher({ voteId, className }: VoteDetailFetcherProps) {
  const numericVoteId = parseInt(voteId, 10);

  if (isNaN(numericVoteId)) {
    // 유효하지 않은 ID인 경우 notFound()를 호출하여 404 페이지를 보여줍니다.
    return notFound();
  }

  try {
    const voteData = await getVoteById(numericVoteId);

    if (!voteData) {
      return notFound();
    }

    const [items, rewards] = await Promise.all([
      getVoteItems(numericVoteId),
      getVoteRewards(numericVoteId),
    ]);

    const vote = {
      ...voteData,
      vote_item: items,
    };

    return (
      <HybridVoteDetailPresenter
        vote={vote as Vote}
        initialItems={(vote?.vote_item || []) as unknown as VoteItem[]}
        rewards={(rewards || []) as Reward[]}
        className={className}
        enableRealtime={true}
        pollingInterval={10000}
        maxRetries={3}
      />
    );
  } catch (error) {
    console.error(`[VoteDetailFetcher] voteId ${voteId}의 상세 정보를 가져오는 데 실패했습니다:`, error);
    // 에러 발생 시에도 404 페이지를 보여주도록 처리합니다.
    return notFound();
  }
}
