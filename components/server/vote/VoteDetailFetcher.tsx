import 'server-only';
import React from 'react';
import { notFound } from 'next/navigation';
import { Vote, VoteItem, Reward } from '@/types/interfaces';
import VoteDetailClientOnly from '@/components/client/vote/detail/VoteDetailClientOnly';
import { getVoteById, getVoteItems, getVoteRewards } from '@/utils/api/queries';
import type { Language } from '@/config/settings';

export interface VoteDetailFetcherProps {
  voteId: string;
  lang: Language;
  className?: string;
}

export default async function VoteDetailFetcher({ voteId, lang, className }: VoteDetailFetcherProps) {
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
      <VoteDetailClientOnly
        vote={vote as Vote}
        initialItems={(vote?.vote_item || []) as unknown as VoteItem[]}
        rewards={(rewards || []) as Reward[]}
        className={className}
        enableRealtime={false}
        pollingInterval={1000}
        maxRetries={3}
        lang={lang}
      />
    );
  } catch (error) {
    console.error(`[VoteDetailFetcher] voteId ${voteId}의 상세 정보를 가져오는 데 실패했습니다:`, error);
    // 에러 발생 시에도 404 페이지를 보여주도록 처리합니다.
    return notFound();
  }
}
