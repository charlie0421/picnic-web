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

    const fallbackTexts: Record<VoteArea, string> = {
      [VOTE_AREAS.ALL]: 'All',
      [VOTE_AREAS.KPOP]: 'K-POP',
      [VOTE_AREAS.MUSICAL]: 'Musical',
      [VOTE_AREAS.PIC_CHART]: 'PIC-CHART',
    };

    const getAreaText = (area: VoteArea) => {
      if (!isTranslationReady) {
        return fallbackTexts[area];
      }

      switch (area) {
        case VOTE_AREAS.ALL:
          return t('label_area_filter_all') || fallbackTexts[area];
        case VOTE_AREAS.KPOP:
          return t('label_area_filter_kpop') || fallbackTexts[area];
        case VOTE_AREAS.MUSICAL:
          return t('label_area_filter_musical') || fallbackTexts[area];
        case VOTE_AREAS.PIC_CHART:
          return t('label_area_filter_pic_chart') || fallbackTexts[area];
        default:
          return fallbackTexts[area];
      }
    };

    const getAriaLabel = (area: VoteArea) => {
      if (!isTranslationReady) {
        return fallbackTexts[area];
      }

      switch (area) {
        case VOTE_AREAS.ALL:
          return t('label_area_filter_all') || fallbackTexts[area];
        case VOTE_AREAS.KPOP:
          return t('label_area_filter_kpop') || fallbackTexts[area];
        case VOTE_AREAS.MUSICAL:
          return t('label_area_filter_musical') || fallbackTexts[area];
        case VOTE_AREAS.PIC_CHART:
          return t('label_area_filter_pic_chart') || fallbackTexts[area];
        default:
          return fallbackTexts[area];
      }
    };

    const getButtonClasses = (area: VoteArea) =>
      [
        'px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        selectedArea === area
          ? 'bg-primary text-white shadow-sm transform scale-[1.02]'
          : 'bg-white text-primary-700 border border-primary/40 hover:bg-primary/10 hover:text-primary-700 hover:shadow-sm',
      ].join(' ');

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
        <button
          onClick={() => onAreaChange(VOTE_AREAS.PIC_CHART)}
          className={getButtonClasses(VOTE_AREAS.PIC_CHART)}
          aria-label={getAriaLabel(VOTE_AREAS.PIC_CHART)}
          aria-pressed={selectedArea === VOTE_AREAS.PIC_CHART}
        >
          {getAreaText(VOTE_AREAS.PIC_CHART)}
        </button>
      </div>
    );
  },
);

VoteAreaFilter.displayName = 'VoteAreaFilter';

export default VoteAreaFilter; 