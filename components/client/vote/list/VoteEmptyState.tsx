'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { VOTE_STATUS, VoteStatus, normalizeVoteStatus } from '@/stores/voteFilterStore';

interface VoteEmptyStateProps {
  /**
   * 표시할 상태. 생략하면 URL 쿼리에서 읽는다.
   *
   * 예전에는 `useVoteFilterStore` 에서 읽었지만, 필터를 저장하지 않게 되면서
   * 스토어 값은 기본값(`ongoing`)에 고정된다. 필터의 진실은 URL 쿼리다.
   */
  selectedStatus?: VoteStatus;
}

const VoteEmptyState: React.FC<VoteEmptyStateProps> = ({ selectedStatus }) => {
  const { t } = useLanguageStore();
  const searchParams = useSearchParams();
  const status = selectedStatus ?? normalizeVoteStatus(searchParams?.get('status'));

  const getEmptyMessage = () => {
    switch (status) {
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
