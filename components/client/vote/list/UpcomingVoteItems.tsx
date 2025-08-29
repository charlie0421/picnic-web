'use client';

import React from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { GridView } from '../common/GridView';

interface UpcomingVoteItemsProps {
  vote: Vote;
}

export const UpcomingVoteItems: React.FC<UpcomingVoteItemsProps> = ({
  vote,
}) => {
  // 스키마 차이를 흡수: vote_item 또는 voteItem 형태를 모두 허용
  const effectiveItems: VoteItem[] =
    ((vote as any)?.vote_item as VoteItem[]) || ((vote as any)?.voteItem as VoteItem[]) || [];

  if (effectiveItems.length === 0) {
    return null;
  }

  return (
    <GridView
      items={effectiveItems}
      style="circular"
      enablePagination={true}
      itemsPerPage={8}
      rows={4}
      enableShuffle={true}
      keyPrefix="upcoming-vote"
    />
  );
};
