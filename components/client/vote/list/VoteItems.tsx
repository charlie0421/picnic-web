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
import { OngoingVoteItems } from './OngoingVoteItems';
import { CompletedVoteItems } from './CompletedVoteItems';
import { UpcomingVoteItems } from './UpcomingVoteItems';

interface VoteItemsProps {
  vote: Vote & { voteItem?: Array<VoteItem & { artist?: any }> };
  mode?: 'list' | 'detail'; // 투표 리스트 vs 투표 상세 모드
  onNavigateToDetail?: (voteId?: string | number) => void; // 투표 상세로 이동
}

/**
 * 투표 항목 컴포넌트
 *
 * 투표 상태(예정/진행중/완료)에 따라 다른 하위 컴포넌트를 렌더링합니다.
 * 클라이언트 컴포넌트로 구현되어야 하는 이유:
 * 1. 이벤트 핸들러 사용
 * 2. useRef, useCallback 등 React 훅 사용
 */
export const VoteItems = ({ vote, mode = 'list', onNavigateToDetail }: VoteItemsProps) => {
  const [displayStatus, setDisplayStatus] = useState<VoteStatus>(
    VOTE_STATUS.UPCOMING,
  );

  // 투표 상태 계산 함수
  const calculateStatus = (date: Date): VoteStatus => {
    if (!vote.start_at || !vote.stop_at) return VOTE_STATUS.UPCOMING;

    const start = new Date(vote.start_at);
    const end = new Date(vote.stop_at);

    // 현재 시간이 시작 시간보다 이전인지 확인
    if (date.getTime() < start.getTime()) return VOTE_STATUS.UPCOMING;
    // 현재 시간이 종료 시간을 지났는지 확인
    if (date.getTime() > end.getTime()) return VOTE_STATUS.COMPLETED;
    // 그 외의 경우는 진행 중
    return VOTE_STATUS.ONGOING;
  };

  // 컴포넌트 마운트 시 초기 상태 계산
  useEffect(() => {
    const now = new Date();
    const initialStatus = calculateStatus(now);
    setDisplayStatus(initialStatus);
  }, [vote]);

  switch (displayStatus) {
    case VOTE_STATUS.UPCOMING:
      return <UpcomingVoteItems vote={vote} />;
    case VOTE_STATUS.ONGOING:
      // 메인 투표 리스트에서는 onVoteChange를 전달하지 않아 투표 기능 비활성화
      return <OngoingVoteItems vote={vote} mode={mode} onNavigateToDetail={onNavigateToDetail} />;
    case VOTE_STATUS.COMPLETED:
      return <CompletedVoteItems vote={vote} mode={mode} />;
    default:
      return null;
  }
};
