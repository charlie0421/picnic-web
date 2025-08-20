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
  // 두 속성 모두 확인하여 유효한 항목 사용 (voteItem을 우선)
  const effectiveItems = vote.voteItem || [];

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
