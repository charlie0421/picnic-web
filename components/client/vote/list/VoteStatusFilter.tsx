'use client';

import React from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from '@/hooks/useTranslationReady';
import { VOTE_STATUS, VoteStatus } from '@/stores/voteFilterStore';
import { useAuth } from '@/hooks/useAuth';

interface VoteStatusFilterProps {
  selectedStatus: VoteStatus;
  onStatusChange: (status: VoteStatus) => void;
}

const VoteStatusFilter = React.memo(
  ({ selectedStatus, onStatusChange }: VoteStatusFilterProps) => {
    const { t } = useLanguageStore();
    const isTranslationReady = useTranslationReady();
    const { userProfile } = useAuth();
    const isAdmin = userProfile?.is_admin === true || userProfile?.is_super_admin === true;

    const fallbackTexts: Record<VoteStatus, string> = {
      [VOTE_STATUS.ONGOING]: 'Ongoing',
      [VOTE_STATUS.UPCOMING]: 'Upcoming',
      [VOTE_STATUS.COMPLETED]: 'Completed',
      [VOTE_STATUS.ADMIN]: 'Admin',
    };

    const getButtonText = (status: VoteStatus) => {
      if (!isTranslationReady) {
        return fallbackTexts[status];
      }

      switch (status) {
        case VOTE_STATUS.ONGOING:
          return t('label_tabbar_vote_active') || fallbackTexts[status];
        case VOTE_STATUS.UPCOMING:
          return t('label_tabbar_vote_upcoming') || fallbackTexts[status];
        case VOTE_STATUS.COMPLETED:
          return t('label_tabbar_vote_end') || fallbackTexts[status];
        case VOTE_STATUS.ADMIN:
          return t('label_tabbar_vote_admin') || fallbackTexts[status];
        default:
          return fallbackTexts[status];
      }
    };

    const getAriaLabel = (status: VoteStatus) => {
      if (!isTranslationReady) {
        return fallbackTexts[status];
      }

      switch (status) {
        case VOTE_STATUS.ONGOING:
          return t('label_tabbar_vote_active') || fallbackTexts[status];
        case VOTE_STATUS.UPCOMING:
          return t('label_tabbar_vote_upcoming') || fallbackTexts[status];
        case VOTE_STATUS.COMPLETED:
          return t('label_tabbar_vote_end') || fallbackTexts[status];
        case VOTE_STATUS.ADMIN:
          return t('label_tabbar_vote_admin') || fallbackTexts[status];
        default:
          return fallbackTexts[status];
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
        {isAdmin && (
          <button
            onClick={() => onStatusChange(VOTE_STATUS.ADMIN)}
            className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
              selectedStatus === VOTE_STATUS.ADMIN
                ? 'bg-primary text-white shadow-sm transform scale-[1.02]'
                : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary hover:shadow-sm'
            }`}
            aria-label={getAriaLabel(VOTE_STATUS.ADMIN)}
            aria-pressed={selectedStatus === VOTE_STATUS.ADMIN}
          >
            {getButtonText(VOTE_STATUS.ADMIN)}
          </button>
        )}
      </div>
    );
  },
);

VoteStatusFilter.displayName = 'VoteStatusFilter';

export default VoteStatusFilter; 