'use client';

import React from 'react';
import { VOTE_AREAS, VoteArea } from '@/stores/voteFilterStore';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from '@/hooks/useTranslationReady';

interface VoteAreaFilterProps {
  selectedArea: VoteArea;
  onAreaChange: (area: VoteArea) => void;
}

const VoteAreaFilter = React.memo(
  ({ selectedArea, onAreaChange }: VoteAreaFilterProps) => {
    const { t } = useLanguageStore();
    const isTranslationReady = useTranslationReady();

    const getAreaText = (area: VoteArea) => {
      if (!isTranslationReady) {
        // 번역이 로드되지 않은 경우 fallback 텍스트 사용
        switch (area) {
          case VOTE_AREAS.ALL:
            return t('vote_area_fallback_all');
          case VOTE_AREAS.KPOP:
            return t('vote_area_fallback_kpop');
          case VOTE_AREAS.MUSICAL:
            return t('vote_area_fallback_musical');
          default:
            return '';
        }
      }

      switch (area) {
        case VOTE_AREAS.ALL:
          return t('label_area_filter_all');
        case VOTE_AREAS.KPOP:
          return t('label_area_filter_kpop');
        case VOTE_AREAS.MUSICAL:
          return t('label_area_filter_musical');
        default:
          return '';
      }
    };

    const getAriaLabel = (area: VoteArea) => {
      if (!isTranslationReady) {
        switch (area) {
          case VOTE_AREAS.ALL:
            return t('vote_area_aria_all');
          case VOTE_AREAS.KPOP:
            return t('vote_area_aria_kpop');
          case VOTE_AREAS.MUSICAL:
            return t('vote_area_aria_musical');
          default:
            return '';
        }
      }

      switch (area) {
        case VOTE_AREAS.ALL:
          return t('label_area_filter_all');
        case VOTE_AREAS.KPOP:
          return t('label_area_filter_kpop');
        case VOTE_AREAS.MUSICAL:
          return t('label_area_filter_musical');
        default:
          return '';
      }
    };

    const getButtonClasses = (area: VoteArea) => 
      `px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
        selectedArea === area
          ? 'bg-primary text-white shadow-sm transform scale-[1.02]'
          : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary hover:shadow-sm'
      }`;

    return (
      <div className='flex flex-wrap justify-start gap-1 sm:gap-1.5 bg-white/50 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-gray-100'>
        <button
          onClick={() => onAreaChange(VOTE_AREAS.ALL)}
          className={getButtonClasses(VOTE_AREAS.ALL)}
          aria-label={getAriaLabel(VOTE_AREAS.ALL)}
          aria-pressed={selectedArea === VOTE_AREAS.ALL}
        >
          {getAreaText(VOTE_AREAS.ALL)}
        </button>
        <button
          onClick={() => onAreaChange(VOTE_AREAS.KPOP)}
          className={getButtonClasses(VOTE_AREAS.KPOP)}
          aria-label={getAriaLabel(VOTE_AREAS.KPOP)}
          aria-pressed={selectedArea === VOTE_AREAS.KPOP}
        >
          {getAreaText(VOTE_AREAS.KPOP)}
        </button>
        <button
          onClick={() => onAreaChange(VOTE_AREAS.MUSICAL)}
          className={getButtonClasses(VOTE_AREAS.MUSICAL)}
          aria-label={getAriaLabel(VOTE_AREAS.MUSICAL)}
          aria-pressed={selectedArea === VOTE_AREAS.MUSICAL}
        >
          {getAreaText(VOTE_AREAS.MUSICAL)}
        </button>
      </div>
    );
  },
);

VoteAreaFilter.displayName = 'VoteAreaFilter';

export default VoteAreaFilter; 