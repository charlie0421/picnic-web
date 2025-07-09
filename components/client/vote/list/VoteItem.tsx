'use client';

import React, { useState, useEffect } from 'react';
import { VoteItem as VoteItemType } from '@/types/interfaces';
import { getCdnImageUrl } from '@/utils/api/image';
import { getLocalizedString, hasValidLocalizedString } from '@/utils/api/strings';
import { useLanguageStore } from '@/stores/languageStore';
import { useVoteStore } from '@/stores/voteStore';

export interface VoteItemProps {
  item: VoteItemType & { artist?: any };
  isSelected?: boolean;
  isDisabled?: boolean;
  showVoteCount?: boolean;
  onSelect?: (itemId: string | number) => void;
  className?: string;
  variant?: 'card' | 'list' | 'compact';
  // 스토어 사용 여부 (기본값: false - 기존 동작 유지)
  useStore?: boolean;
}

export function VoteItem({
  item,
  isSelected: propIsSelected = false,
  isDisabled = false,
  showVoteCount = true,
  onSelect,
  className = '',
  variant = 'card',
  useStore = false
}: VoteItemProps) {
  const { currentLanguage } = useLanguageStore();
  
  // Zustand 스토어 상태
  const { submission, selectVoteItem } = useVoteStore();

  // 스토어 사용 여부에 따라 선택 상태 결정
  const isSelected = useStore 
    ? submission.selectedItemId === item.id 
    : propIsSelected;

  const [isHovered, setIsHovered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 아티스트 정보 추출
  const artistName = item.artist
    ? getLocalizedString(item.artist.name, currentLanguage) || '아티스트'
    : '아티스트';

  const artistGroup = item.artist?.artistGroup?.name && hasValidLocalizedString(item.artist.artistGroup.name)
    ? getLocalizedString(item.artist.artistGroup.name, currentLanguage)
    : null;

  // 이미지 URL
  const imageUrl = item.artist?.image
    ? getCdnImageUrl(item.artist.image)
    : '/images/default-artist.png';

  // 투표수
  const voteCount = item.vote_total || 0;

  // 클릭 핸들러
  const handleClick = () => {
    if (isDisabled) return;
    
    if (useStore) {
      // Zustand 스토어를 사용한 선택
      const newSelectedId = isSelected ? null : item.id;
      selectVoteItem(newSelectedId);
    } else {
      // 기존 방식 (하위 호환성)
      if (!onSelect) return;
      onSelect(item.id);
    }
  };

  // 키보드 핸들러
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isDisabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  // 스타일 설정
  const getVariantStyles = () => {
    switch (variant) {
      case 'list':
        return {
          container: 'flex items-center p-4 rounded-lg border transition-all duration-200',
          image: 'w-12 h-12 rounded-full mr-4 flex-shrink-0',
          content: 'flex-1 min-w-0',
          name: 'text-base font-medium',
          group: 'text-sm text-gray-600',
          votes: 'text-sm font-bold'
        };
      case 'compact':
        return {
          container: 'flex items-center p-2 rounded border transition-all duration-200',
          image: 'w-8 h-8 rounded-full mr-2 flex-shrink-0',
          content: 'flex-1 min-w-0',
          name: 'text-sm font-medium',
          group: 'text-xs text-gray-600',
          votes: 'text-xs font-bold'
        };
      default: // card
        return {
          container: 'flex flex-col items-center p-4 rounded-xl transition-all duration-200',
          image: 'w-20 h-20 rounded-full mb-3',
          content: 'text-center w-full',
          name: 'text-base font-medium mb-1',
          group: 'text-sm text-gray-600 mb-2',
          votes: 'text-sm font-bold'
        };
    }
  };

  const styles = getVariantStyles();

  // 선택 가능 여부 결정
  const canSelect = useStore || onSelect;

  // 선택 상태에 따른 스타일
  const getSelectionStyles = () => {
    if (isDisabled) {
      return 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-300';
    }
    if (isSelected) {
      return 'bg-primary/10 border-primary border-2 shadow-md';
    }
    return `bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm ${canSelect ? 'cursor-pointer' : 'cursor-default'}`;
  };

  return (
    <div
      className={`${styles.container} ${getSelectionStyles()} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={canSelect && !isDisabled ? 0 : -1}
      role={canSelect ? 'button' : 'presentation'}
      aria-pressed={canSelect ? isSelected : undefined}
      aria-disabled={isDisabled}
    >
      {/* 이미지 */}
      <div className={`${styles.image} overflow-hidden border border-gray-200 shadow-sm`}>
        <img
          src={imageUrl}
          alt={artistName}
          className='w-full h-full object-cover transition-transform duration-200 hover:scale-105'
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/images/default-artist.png';
            target.onerror = null;
          }}
        />
      </div>

      {/* 콘텐츠 */}
      <div className={styles.content}>
        {/* 아티스트 이름 */}
        <h3 className={`${styles.name} text-gray-900 truncate`}>
          {artistName}
        </h3>

        {/* 그룹 이름 (있는 경우) */}
        {artistGroup && (
          <p className={`${styles.group} truncate`}>
            {artistGroup}
          </p>
        )}

        {/* 투표수 (표시 옵션이 활성화된 경우) */}
        {showVoteCount && isMounted && (
          <div className={`${styles.votes} text-primary`}>
            {voteCount.toLocaleString()} 표
          </div>
        )}
      </div>

      {/* 선택 표시 */}
      {isSelected && canSelect && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md">
          <svg
            className="w-4 h-4 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      )}

      {/* 호버 효과 */}
      {isHovered && canSelect && !isDisabled && !isSelected && (
        <div className="absolute inset-0 bg-primary/5 rounded-xl pointer-events-none" />
      )}
    </div>
  );
}

export default VoteItem; 