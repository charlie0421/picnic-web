'use client';

import React from 'react';
import { VoteItem } from '@/types/interfaces';
import { VoteRankCard } from './VoteRankCard';

interface EnhancedVoteItem extends VoteItem {
  artist?: any;
  isAnimating?: boolean;
  voteChange?: number;
}

interface GridViewProps {
  items: Array<EnhancedVoteItem>;
  disabled?: boolean;
  showVoteChange?: boolean;
  onVoteChange?: (itemId: string | number, newTotal: number) => void;
  keyPrefix?: string;
  columns?: number;
  cardSize?: 'sm' | 'md' | 'lg';
}

export const GridView: React.FC<GridViewProps> = ({
  items,
  disabled = false,
  showVoteChange = false,
  onVoteChange,
  keyPrefix = 'grid',
  columns = 3,
  cardSize = 'md'
}) => {
  if (items.length === 0) {
    return null;
  }

  // 카드 크기 설정
  const getCardSizeClass = () => {
    switch (cardSize) {
      case 'sm':
        return 'w-16 h-20';
      case 'lg':
        return 'w-32 h-40';
      case 'md':
      default:
        return 'w-24 h-32';
    }
  };

  // 그리드 컬럼 클래스 설정
  const getGridColumns = () => {
    switch (columns) {
      case 2:
        return 'grid-cols-2';
      case 4:
        return 'grid-cols-4';
      case 5:
        return 'grid-cols-5';
      case 6:
        return 'grid-cols-6';
      case 3:
      default:
        return 'grid-cols-3';
    }
  };

  const cardSizeClass = getCardSizeClass();
  const gridColumnsClass = getGridColumns();

  return (
    <div className={`w-full ${disabled ? 'opacity-70 grayscale pointer-events-none select-none' : ''}`}>
      <div className={`grid ${gridColumnsClass} gap-4 justify-items-center`}>
        {items.map((item, index) => (
          <div key={`${keyPrefix}-${item.id}-${index}`} className="flex flex-col items-center">
            <VoteRankCard
              className={cardSizeClass}
              item={item}
              rank={index + 1}
              showVoteChange={showVoteChange && !disabled}
              isAnimating={item.isAnimating && !disabled}
              voteChange={item.voteChange}
              voteTotal={item.vote_total ?? 0}
              onVoteChange={!disabled && onVoteChange ? (newTotal) => onVoteChange(item.id, newTotal) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}; 