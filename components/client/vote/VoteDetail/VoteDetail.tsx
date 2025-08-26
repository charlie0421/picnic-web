'use client';

import React, { useEffect, useRef } from 'react';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';

// 이제 voteData는 항상 존재한다고 가정하고, 로딩 상태는 상위 Suspense에서 처리합니다.
const VoteDetail = ({ voteData }: { voteData: any }) => {
  const { vote, voteItems, rewards, user, userVotes } = voteData;

  // 상태 전환(예정→진행, 진행→마감) 시점에 페이지 자동 새로고침
  const reloadTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    let nextTimestamp: number | null = null;

    if (vote?.start_at) {
      const startTs = new Date(vote.start_at).getTime();
      if (!Number.isNaN(startTs) && startTs > now) {
        nextTimestamp = startTs;
      }
    }
    if (vote?.stop_at) {
      const stopTs = new Date(vote.stop_at).getTime();
      if (!Number.isNaN(stopTs) && stopTs > now) {
        nextTimestamp = nextTimestamp === null ? stopTs : Math.min(nextTimestamp, stopTs);
      }
    }

    if (reloadTimerRef.current) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }

    if (nextTimestamp !== null) {
      const delay = Math.max(0, nextTimestamp - Date.now());
      reloadTimerRef.current = window.setTimeout(() => {
        window.location.reload();
      }, delay);
    }

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [vote?.start_at, vote?.stop_at]);

  return (
    <HybridVoteDetailPresenter
      vote={vote}
      initialItems={voteItems}
      rewards={rewards}
    />
  );
};

export default VoteDetail; 