'use client';

import React, { useEffect, useState } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import VoteRankCard from './VoteRankCard';

interface CompletedVoteItemsProps {
  vote: Vote & {
    voteItem?: Array<VoteItem & { artist?: any }>;
    voteItems?: Array<VoteItem & { artist?: any }>; // 이전 속성 호환성 유지
  };
}

const CompletedVoteItems: React.FC<CompletedVoteItemsProps> = ({ vote }) => {
  const [topThreeItems, setTopThreeItems] = useState<
    Array<VoteItem & { artist?: any }>
  >([]);

  useEffect(() => {
    console.log('[CompletedVoteItems] 렌더링:', {
      id: vote.id,
      title: vote.title,
      voteItemCount: vote.voteItem?.length || 0,
      voteItemsCount: vote.voteItems?.length || 0,
    });

    // voteItem 또는 voteItems 중 사용 가능한 데이터 선택 (voteItem 우선)
    const effectiveItems = vote.voteItem || vote.voteItems || [];

    if (effectiveItems.length > 0) {
      const sorted = [...effectiveItems]
        .sort((a, b) => (b.voteTotal || 0) - (a.voteTotal || 0))
        .slice(0, 3);

      setTopThreeItems(sorted);

      console.log('[CompletedVoteItems] 정렬된 상위 3개 항목:', {
        count: sorted.length,
        first: sorted[0]
          ? {
              id: sorted[0].id,
              artistName: sorted[0].artist?.name,
              voteTotal: sorted[0].voteTotal || 0,
            }
          : null,
      });
    }
  }, [vote]);

  if (topThreeItems.length === 0) {
    console.log('[CompletedVoteItems] 표시할 아이템 없음');
    return null;
  }

  console.log(
    '[CompletedVoteItems] Top 3 아이템 렌더링:',
    topThreeItems.length,
  );

  return (
    <div className='flex justify-center items-center gap-2 md:gap-0.5 w-full max-w-full overflow-hidden px-2 py-2'>
      {topThreeItems.map((item, index) => (
        <VoteRankCard
          key={item.id}
          item={item}
          rank={index + 1}
          className='opacity-80 grayscale'
        />
      ))}
    </div>
  );
};

export default CompletedVoteItems;
