'use client';

import React from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { VOTE_STATUS, useVoteFilterStore } from '@/stores/voteFilterStore';

interface VoteEmptyStateProps {
  // selectedStatus는 store에서 직접 가져오므로 prop 불필요
}

const VoteEmptyState: React.FC<VoteEmptyStateProps> = () => {
  const { t } = useLanguageStore();
  const { selectedStatus } = useVoteFilterStore();

  const getEmptyMessage = () => {
    switch (selectedStatus) {
      case VOTE_STATUS.ONGOING:
        return '진행 중인 투표가 없습니다.';
      case VOTE_STATUS.UPCOMING:
        return '예정된 투표가 없습니다.';
      case VOTE_STATUS.COMPLETED:
        return '완료된 투표가 없습니다.';
      default:
        return '투표가 없습니다.';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4">
        <svg
          className="w-16 h-16 text-gray-300 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </div>
      <p className="text-gray-500 text-lg">{getEmptyMessage()}</p>
    </div>
  );
};

export default VoteEmptyState; 