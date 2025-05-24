'use client';

import React from 'react';
import { VoteItem } from '@/types/interfaces';
import { VoteRankCard } from './VoteRankCard';

interface EnhancedVoteItem extends VoteItem {
  artist?: any;
  isAnimating?: boolean;
  voteChange?: number;
}

interface RankingViewProps {
  items: Array<EnhancedVoteItem>;
  disabled?: boolean;
  showVoteChange?: boolean;
  onVoteChange?: (itemId: string | number, newTotal: number) => void;
  keyPrefix?: string;
}

export const RankingView: React.FC<RankingViewProps> = ({
  items,
  disabled = false,
  showVoteChange = false,
  onVoteChange,
  keyPrefix = 'ranking'
}) => {
  // 상위 3개 아이템만 추출
  const topItems = items.slice(0, 3);

  if (topItems.length === 0) {
    return null;
  }

  // disabled 상태에 따른 스타일 클래스
  const containerClass = disabled 
    ? 'w-full opacity-70 grayscale pointer-events-none select-none cursor-not-allowed' 
    : 'w-full';

  // disabled 상태에 따른 인터랙션 제어
  const isInteractionEnabled = !disabled;
  const shouldShowVoteChange = showVoteChange && isInteractionEnabled;
  const handleVoteChange = isInteractionEnabled ? onVoteChange : undefined;

  return (
    <div className={containerClass}>
      <div className='flex flex-col items-center justify-center'>
        {/* 계층적 랭킹 카드 - 1, 2, 3위 순서 배치 */}
        <div className='flex justify-center items-center w-full'>
          {/* 1위 - 가장 크고 높음 */}
          {topItems[0] && (
              <VoteRankCard
                className='flex-[3] max-w-xs h-60 flex-shrink-0 min-h-60 max-h-60 mx-0 min-w-0'
                key={`${keyPrefix}-rank-${topItems[0].id}-0`}
                item={topItems[0]}
                rank={1}
                showVoteChange={shouldShowVoteChange}
                isAnimating={topItems[0].isAnimating && isInteractionEnabled}
                voteChange={topItems[0].voteChange}
                voteTotal={topItems[0].vote_total ?? 0}
                onVoteChange={handleVoteChange ? (newTotal) => handleVoteChange(topItems[0].id, newTotal) : undefined}
              />
          )}

          {/* 2위 - 중간 크기 */}
          {topItems[1] && (
              <VoteRankCard
                className='flex-[2] max-w-sm h-44 flex-shrink-0 min-h-44 max-h-44 mx-0 min-w-0'
                key={`${keyPrefix}-rank-${topItems[1].id}-1`}
                item={topItems[1]}
                rank={2}
                showVoteChange={shouldShowVoteChange}
                isAnimating={topItems[1].isAnimating && isInteractionEnabled}
                voteChange={topItems[1].voteChange}
                voteTotal={topItems[1].vote_total ?? 0}
                onVoteChange={handleVoteChange ? (newTotal) => handleVoteChange(topItems[1].id, newTotal) : undefined}
              />
          )}

          {/* 3위 - 가장 작음 */}
          {topItems[2] && (
              <VoteRankCard
                className='flex-[1] max-w-xs h-30 flex-shrink-0 min-h-30 max-h-30 mx-0 min-w-0'
                key={`${keyPrefix}-rank-${topItems[2].id}-2`}
                item={topItems[2]}
                rank={3}
                showVoteChange={shouldShowVoteChange}
                isAnimating={topItems[2].isAnimating && isInteractionEnabled}
                voteChange={topItems[2].voteChange}
                voteTotal={topItems[2].vote_total ?? 0}
                onVoteChange={handleVoteChange ? (newTotal) => handleVoteChange(topItems[2].id, newTotal) : undefined}
              />
          )}
        </div>
      </div>
    </div>
  );
}; 