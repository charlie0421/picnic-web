'use client';

import React from 'react';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';

// 이제 voteData는 항상 존재한다고 가정하고, 로딩 상태는 상위 Suspense에서 처리합니다.
const VoteDetail = ({ voteData }: { voteData: any }) => {
  return (
    <HybridVoteDetailPresenter
      vote={voteData.vote}
      initialItems={voteData.voteItems}
      rewards={voteData.rewards}
    />
  );
};

export default VoteDetail; 