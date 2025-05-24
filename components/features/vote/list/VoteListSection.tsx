'use client';

import React, { useEffect, useState } from 'react';
import { Vote } from '@/types/interfaces';
import VoteCard from './VoteCard';
import VoteLoadingSkeleton from './VoteLoadingSkeleton';
import VoteEmptyState from './VoteEmptyState';
import { useVoteFilterStore } from '@/stores/voteFilterStore';

interface VoteListSectionProps {
  votes: Vote[];
  isLoading: boolean;
  isTransitioning: boolean;
  onVoteClick: (voteId: string) => void;
}

const VoteListSection: React.FC<VoteListSectionProps> = ({
  votes,
  isLoading,
  isTransitioning,
  onVoteClick,
}) => {
  const { selectedStatus } = useVoteFilterStore();
  const [isMounted, setIsMounted] = useState(false);

  // 클라이언트 마운트 상태 추적
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 서버 렌더링 중에는 항상 로딩 스켈레톤 표시 (hydration 불일치 방지)
  if (!isMounted) {
    return <VoteLoadingSkeleton />;
  }

  // 로딩 중이고 데이터가 없는 경우 스켈레톤 표시
  if (isLoading && (!votes || votes.length === 0)) {
    return <VoteLoadingSkeleton />;
  }

  // 데이터가 없는 경우 메시지 표시
  if (!votes || votes.length === 0) {
    return (
      <div
        className={`transition-all duration-300 ${
          isTransitioning ? 'opacity-50' : 'opacity-100'
        }`}
      >
        <VoteEmptyState selectedStatus={selectedStatus} />
      </div>
    );
  }

  // 데이터가 있는 경우 목록 표시
  return (
    <div
      className={`transition-all duration-300 ${
        isTransitioning ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8'>
        {votes.map((vote) => (
          <VoteCard
            key={vote.id}
            vote={vote}
            onClick={() => onVoteClick(vote.id.toString())}
          />
        ))}
      </div>
    </div>
  );
};

export default VoteListSection;
