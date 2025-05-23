'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import UpcomingVoteItems from '@/components/features/vote/UpcomingVoteItems';
import OngoingVoteItems from '@/components/features/vote/OngoingVoteItems';
import CompletedVoteItems from '@/components/features/vote/CompletedVoteItems';

const VOTE_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
} as const;

type VoteStatus = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];

interface VoteItemsProps {
  vote: Vote & { voteItem?: Array<VoteItem & { artist?: any }> };
}

/**
 * 투표 항목 컴포넌트
 *
 * 투표 상태(예정/진행중/완료)에 따라 다른 하위 컴포넌트를 렌더링합니다.
 * 클라이언트 컴포넌트로 구현되어야 하는 이유:
 * 1. 이벤트 핸들러 사용
 * 2. useRef, useCallback 등 React 훅 사용
 */
const VoteItems = React.memo(({ vote }: VoteItemsProps) => {
  const [displayStatus, setDisplayStatus] = useState<VoteStatus>(
    VOTE_STATUS.UPCOMING,
  );

  // 투표 상태 계산 함수
  const calculateStatus = useCallback(
    (date: Date): VoteStatus => {
      if (!vote.startAt || !vote.stopAt) return VOTE_STATUS.UPCOMING;

      const start = new Date(vote.startAt);
      const end = new Date(vote.stopAt);

      // 디버깅 정보 추가
      console.log('VoteItems 상태 계산:', {
        id: vote.id,
        title:
          typeof vote.title === 'object'
            ? (vote.title as any)?.ko || (vote.title as any)?.en || '제목 없음'
            : vote.title || '제목 없음',
        now: date.toISOString(),
        start: start.toISOString(),
        end: end.toISOString(),
        beforeStart: date < start,
        afterEnd: date > end,
        dates: {
          now: date.toLocaleString(),
          start: start.toLocaleString(),
          end: end.toLocaleString(),
        },
        timeLeft: {
          toStart: Math.round((start.getTime() - date.getTime()) / 1000 / 60),
          toEnd: Math.round((end.getTime() - date.getTime()) / 1000 / 60),
        },
      });

      // 현재 시간이 시작 시간보다 이전인지 확인
      if (date.getTime() < start.getTime()) return VOTE_STATUS.UPCOMING;
      // 현재 시간이 종료 시간을 지났는지 확인
      if (date.getTime() > end.getTime()) return VOTE_STATUS.COMPLETED;
      // 그 외의 경우는 진행 중
      return VOTE_STATUS.ONGOING;
    },
    [vote.startAt, vote.stopAt, vote.id, vote.title],
  );

  // 컴포넌트 마운트 시 초기 상태 계산
  useEffect(() => {
    const now = new Date();
    const initialStatus = calculateStatus(now);

    console.log('VoteItems 초기 상태:', {
      id: vote.id,
      title: vote.title,
      status: initialStatus,
      voteItemCount: vote.voteItem?.length || 0,
    });

    setDisplayStatus(initialStatus);
  }, [vote, calculateStatus]);

  // 투표 업데이트 핸들러
  const handleVoteChange = useCallback(
    (voteId: string | number, itemId: string | number, newTotal: number) => {
      console.log(
        `VoteItems: 투표 변경 감지 - ${voteId}:${itemId} = ${newTotal}`,
      );
      // 여기서 추가 로직 구현 가능
    },
    [],
  );

  console.log('VoteItems 렌더링:', {
    id: vote.id,
    status: displayStatus,
    voteItemCount: vote.voteItem?.length || 0,
  });

  switch (displayStatus) {
    case VOTE_STATUS.UPCOMING:
      return <UpcomingVoteItems voteItem={vote.voteItem} />;
    case VOTE_STATUS.ONGOING:
      return <OngoingVoteItems vote={vote} onVoteChange={handleVoteChange} />;
    case VOTE_STATUS.COMPLETED:
      return <CompletedVoteItems vote={vote} />;
    default:
      return null;
  }
});

VoteItems.displayName = 'VoteItems';

export default VoteItems;
