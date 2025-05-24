'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { VOTE_STATUS, VoteStatus } from '@/stores/voteFilterStore';
import UpcomingVoteItems from '@/components/features/vote/UpcomingVoteItems';
import OngoingVoteItems from '@/components/features/vote/OngoingVoteItems';
import CompletedVoteItems from '@/components/features/vote/CompletedVoteItems';

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
    setDisplayStatus(initialStatus);
  }, [vote, calculateStatus]);

  // 투표 업데이트 핸들러
  const handleVoteChange = useCallback(
    (voteId: string | number, itemId: string | number, newTotal: number) => {
      // 여기서 추가 로직 구현 가능
    },
    [],
  );

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
