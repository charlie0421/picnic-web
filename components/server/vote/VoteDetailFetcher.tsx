import 'server-only';
import React from 'react';
import { notFound } from 'next/navigation';
import { Vote, VoteItem, Reward } from '@/types/interfaces';
import VoteDetailClientOnly from '@/components/client/vote/detail/VoteDetailClientOnly';
import { getVoteById, getVoteItems, getVoteRewards } from '@/utils/api/queries';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';
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

  let voteData: Awaited<ReturnType<typeof getVoteById>>;
  try {
    voteData = await getVoteById(numericVoteId);
  } catch (error) {
    console.error(`[VoteDetailFetcher] voteId ${voteId}의 상세 정보를 가져오는 데 실패했습니다:`, error);
    return notFound();
  }

  if (!voteData) {
    return notFound();
  }

  const visibleAt = voteData.visible_at ? Date.parse(voteData.visible_at) : Number.NaN;
  const isPubliclyVisible = Number.isFinite(visibleAt) && visibleAt <= Date.now();
  if (!isPubliclyVisible) {
    const userContext = await getCurrentUserContext();
    if (userContext.isAdmin !== true) {
      return notFound();
    }
  }

  try {
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
        pollingInterval={5000}
        maxRetries={3}
        lang={lang}
      />
    );
  } catch (error) {
    console.error(`[VoteDetailFetcher] voteId ${voteId}의 상세 정보를 가져오는 데 실패했습니다:`, error);
    return notFound();
  }
}
