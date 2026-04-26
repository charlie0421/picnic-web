'use client';

import React from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { GridView } from '../common/GridView';

interface UpcomingVoteItemsProps {
  vote: Vote;
  displayLanguage?: string;
}

export const UpcomingVoteItems: React.FC<UpcomingVoteItemsProps> = ({
  vote,
  displayLanguage,
}) => {
  // 스키마 차이를 흡수: vote_item 또는 voteItem 형태를 모두 허용
  const rawItems: VoteItem[] = ((vote as any)?.vote_item as VoteItem[]) || ((vote as any)?.voteItem as VoteItem[]) || [];
  const effectiveItems: VoteItem[] = React.useMemo(() => {
    return rawItems.filter((it: any) => !it?.deleted_at);
  }, [rawItems]);

  if (effectiveItems.length === 0) {
    return null;
  }

  const keyPrefix = `upcoming-vote-${vote.id}`;

  return (
    <GridView
      items={effectiveItems}
      style="circular"
      enablePagination={true}
      rows={4}
      itemsPerPage={20}
      fixedColumns={5}
      gridColumnsClassName='grid-cols-4 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-5'
      enableShuffle={true}
      keyPrefix={keyPrefix}
      displayLanguage={displayLanguage}
    />
  );
};
