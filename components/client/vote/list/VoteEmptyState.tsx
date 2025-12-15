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
        return t('vote_empty_state_ongoing');
      case VOTE_STATUS.UPCOMING:
        return t('vote_empty_state_upcoming');
      case VOTE_STATUS.COMPLETED:
        return t('vote_empty_state_completed');
      default:
        return t('vote_empty_state_default');
    }
  };

  return (
    <div className="py-8 text-center">
      <p className="text-gray-500">{getEmptyMessage()}</p>
    </div>
  );
};

export default VoteEmptyState; 