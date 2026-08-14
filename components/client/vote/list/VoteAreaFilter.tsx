'use client';

import React from 'react';
import { VOTE_AREA_TABS, VoteArea } from '@/stores/voteFilterStore';

interface VoteAreaFilterProps {
  selectedArea: VoteArea;
  onAreaChange: (area: VoteArea) => void;
}

/**
 * 투표 종류 태그(칩).
 *
 * 앱 `vote_list_page.dart` 의 `_buildTypeChips` 와 같은 형태 — 가로 스크롤 pill 칩,
 * 항목과 순서는 `VOTE_AREA_TABS` 가 단일 출처다. 라벨은 앱과 동일하게 영문 고정이라
 * 번역을 태우지 않는다.
 */
const VoteAreaFilter = React.memo(
  ({ selectedArea, onAreaChange }: VoteAreaFilterProps) => {
    const getButtonClasses = (area: VoteArea) =>
      [
        'shrink-0 px-4 py-1.5 rounded-full text-xs sm:text-sm transition-all duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        selectedArea === area
          ? 'bg-primary text-white border border-primary font-bold shadow-sm'
          : 'bg-white text-gray-600 border border-gray-300 font-medium hover:bg-primary/10 hover:text-primary-700',
      ].join(' ');

    return (
      <div
        role='tablist'
        aria-label='Vote type'
        // 가로 스크롤. 스크롤바는 숨기고 터치 스크롤만 남긴다.
        className='flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
      >
        {VOTE_AREA_TABS.map(({ area, label }) => (
          <button
            key={area}
            type='button'
            role='tab'
            onClick={() => onAreaChange(area)}
            className={getButtonClasses(area)}
            aria-label={label}
            aria-selected={selectedArea === area}
          >
            {label}
          </button>
        ))}
      </div>
    );
  },
);

VoteAreaFilter.displayName = 'VoteAreaFilter';

export default VoteAreaFilter;
