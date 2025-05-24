'use client';

import React, { useEffect, useState } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { VoteRankCard } from './VoteRankCard';

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
    // voteItem 또는 voteItems 중 사용 가능한 데이터 선택 (voteItem 우선)
    const effectiveItems = vote.voteItem || vote.voteItems || [];

    if (effectiveItems.length > 0) {
      const sorted = [...effectiveItems]
        .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
        .slice(0, 3);

      setTopThreeItems(sorted);
    }
  }, [vote]);

  if (topThreeItems.length === 0) {
    return null;
  }

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
