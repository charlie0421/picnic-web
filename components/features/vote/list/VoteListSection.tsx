'use client';

import React, { useEffect } from 'react';
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

  // 컴포넌트가 마운트되거나 votes가 변경될 때마다 로그 출력
  useEffect(() => {
    console.log('[VoteListSection] 렌더링:', {
      votes: votes,
      votesCount: votes?.length || 0,
      isLoading,
      isTransitioning,
      selectedStatus,
    });
  }, [votes, isLoading, isTransitioning, selectedStatus]);

  // 로딩 중이고 표시할 데이터가 없는 경우 스켈레톤 표시
  if (isLoading && (!votes || votes.length === 0)) {
    console.log('[VoteListSection] 로딩 스켈레톤 표시');
    return <VoteLoadingSkeleton />;
  }

  // 데이터가 없는 경우 메시지 표시
  if (!votes || votes.length === 0) {
    console.log('[VoteListSection] 데이터 없음 표시');
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
  console.log('[VoteListSection] 투표 목록 표시', votes.length);
  return (
    <div
      className={`transition-all duration-300 ${
        isTransitioning ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 md:gap-8'>
        {votes.map((vote) => {
          console.log('[VoteListSection] 렌더링 vote:', vote.id, vote.title);
          return (
            <VoteCard
              key={vote.id}
              vote={vote}
              onClick={() => onVoteClick(vote.id.toString())}
            />
          );
        })}
      </div>
    </div>
  );
};

export default VoteListSection;
