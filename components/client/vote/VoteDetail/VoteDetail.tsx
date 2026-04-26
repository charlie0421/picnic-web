'use client';

import React, { useEffect, useRef } from 'react';
import VoteDetailPresenter from '@/components/client/vote/detail/VoteDetailPresenter';
import type { Language } from '@/config/settings';

// 이제 voteData는 항상 존재한다고 가정하고, 로딩 상태는 상위 Suspense에서 처리합니다.
const VoteDetail = ({ voteData, lang }: { voteData: any; lang: Language }) => {
  const { vote, voteItems, rewards, user, userVotes } = voteData;

  // 상태 전환(예정→진행, 진행→마감) 시점에 페이지 자동 새로고침
  const reloadTimerRef = useRef<number | null>(null);
  const nextTransitionTsRef = useRef<number | null>(null);
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
      nextTransitionTsRef.current = nextTimestamp;
      const delay = Math.max(0, nextTimestamp - Date.now());
      reloadTimerRef.current = window.setTimeout(() => {
        window.location.reload();
      }, delay);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const ts = nextTransitionTsRef.current;
        if (ts !== null && Date.now() >= ts) {
          window.location.reload();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [vote?.start_at, vote?.stop_at]);

  return (
    <VoteDetailPresenter
      vote={vote}
      initialItems={voteItems}
      rewards={rewards}
      lang={lang}
    />
  );
};

export default VoteDetail; 