'use client';

import React from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from '@/hooks/useTranslationReady';
import { VOTE_STATUS, VoteStatus } from '@/stores/voteFilterStore';

interface VoteStatusFilterProps {
  selectedStatus: VoteStatus;
  onStatusChange: (status: VoteStatus) => void;
}

const VoteStatusFilter = React.memo(
  ({ selectedStatus, onStatusChange }: VoteStatusFilterProps) => {
    const { t } = useLanguageStore();
    const isTranslationReady = useTranslationReady();

    const getButtonText = (status: VoteStatus) => {
      if (!isTranslationReady) {
        // 번역이 로드되지 않은 경우 fallback 텍스트 사용
        switch (status) {
          case VOTE_STATUS.ONGOING:
            return '진행 중';
          case VOTE_STATUS.UPCOMING:
            return '예정';
          case VOTE_STATUS.COMPLETED:
            return '완료';
          default:
            return '';
        }
      }

      switch (status) {
        case VOTE_STATUS.ONGOING:
          return t('label_tabbar_vote_active');
        case VOTE_STATUS.UPCOMING:
          return t('label_tabbar_vote_upcoming');
        case VOTE_STATUS.COMPLETED:
          return t('label_tabbar_vote_end');
        default:
          return '';
      }
    };

    const getAriaLabel = (status: VoteStatus) => {
      if (!isTranslationReady) {
        switch (status) {
          case VOTE_STATUS.ONGOING:
            return '진행 중인 투표';
          case VOTE_STATUS.UPCOMING:
            return '예정된 투표';
          case VOTE_STATUS.COMPLETED:
            return '완료된 투표';
          default:
            return '';
        }
      }

      switch (status) {
        case VOTE_STATUS.ONGOING:
          return t('label_tabbar_vote_active');
        case VOTE_STATUS.UPCOMING:
          return t('label_tabbar_vote_upcoming');
        case VOTE_STATUS.COMPLETED:
          return t('label_tabbar_vote_end');
        default:
          return '';
      }
    };

    return (
      <div className='flex flex-wrap justify-end gap-1 sm:gap-1.5 bg-white/50 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-gray-100'>
        <button
          onClick={() => onStatusChange(VOTE_STATUS.ONGOING)}
          className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
            selectedStatus === VOTE_STATUS.ONGOING
              ? 'bg-primary text-white shadow-sm transform scale-[1.02]'
              : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary hover:shadow-sm'
          }`}
          aria-label={getAriaLabel(VOTE_STATUS.ONGOING)}
          aria-pressed={selectedStatus === VOTE_STATUS.ONGOING}
        >
          {getButtonText(VOTE_STATUS.ONGOING)}
        </button>
        <button
          onClick={() => onStatusChange(VOTE_STATUS.UPCOMING)}
          className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
            selectedStatus === VOTE_STATUS.UPCOMING
              ? 'bg-primary text-white shadow-sm transform scale-[1.02]'
              : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary hover:shadow-sm'
          }`}
          aria-label={getAriaLabel(VOTE_STATUS.UPCOMING)}
          aria-pressed={selectedStatus === VOTE_STATUS.UPCOMING}
        >
          {getButtonText(VOTE_STATUS.UPCOMING)}
        </button>
        <button
          onClick={() => onStatusChange(VOTE_STATUS.COMPLETED)}
          className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
            selectedStatus === VOTE_STATUS.COMPLETED
              ? 'bg-primary text-white shadow-sm transform scale-[1.02]'
              : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary hover:shadow-sm'
          }`}
          aria-label={getAriaLabel(VOTE_STATUS.COMPLETED)}
          aria-pressed={selectedStatus === VOTE_STATUS.COMPLETED}
        >
          {getButtonText(VOTE_STATUS.COMPLETED)}
        </button>
      </div>
    );
  },
);

VoteStatusFilter.displayName = 'VoteStatusFilter';

export default VoteStatusFilter; 