'use client';

import React from 'react';
import { VoteItem } from '@/types/interfaces';
import { VoteRankCard } from './VoteRankCard';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { useLanguageStore } from '@/stores/languageStore';

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
  mode?: 'list' | 'detail'; // 투표 리스트 vs 투표 상세 모드
  onNavigateToDetail?: (voteId?: string | number) => void; // 투표 상세로 이동
}

export const RankingView: React.FC<RankingViewProps> = ({
  items,
  disabled = false,
  showVoteChange = false,
  onVoteChange,
  keyPrefix = 'ranking',
  mode = 'detail', // 기본값은 detail (기존 동작 유지)
  onNavigateToDetail
}) => {
  const { t } = useLanguageStore();
  
  // 한 번만 인증 훅을 호출
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: t('vote_login_required_title'),
      description: t('vote_login_required_description'),
    },
  });

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

  // 인증된 투표 함수 생성
  const createAuthenticatedVoteHandler = (item: EnhancedVoteItem) => {
    if (!handleVoteChange) return undefined;
    
    return async () => {
      console.log('🔐 [RankingView] 인증된 투표 처리 시작:', { itemId: item.id });
      
      const result = await withAuth(async () => {
        console.log('✅ [RankingView] 인증 성공, 투표 처리:', { itemId: item.id });
        
        // 실제 투표 로직
        const currentTotal = item.vote_total || 0;
        const newTotal = currentTotal + 1;
        
        handleVoteChange(item.id, newTotal);
        return true;
      });

      if (!result) {
        console.log('❌ [RankingView] 인증 실패:', { itemId: item.id });
      } else {
        console.log('✅ [RankingView] 투표 처리 완료:', { itemId: item.id });
      }
    };
  };

  // 2명만 있는 경우와 3명 있는 경우 분리
  if (topItems.length === 2) {
    return (
      <div className={containerClass}>
        <div className='flex flex-col items-center justify-center'>
          {/* 2명일 때 포디움 형식 - 1위 왼쪽, 2위 오른쪽 */}
          <div className='flex justify-center items-end w-full max-w-xs sm:max-w-sm md:max-w-md gap-2 sm:gap-3 px-4 sm:px-6 mx-auto'>
            {/* 1위 - 왼쪽, 높음 */}
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10 flex-1'>
              <div className='relative w-full max-w-[100px] sm:max-w-[120px] md:max-w-[135px]'>
                <div className='absolute -inset-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                  <VoteRankCard
                    className='w-full h-40 sm:h-44 md:h-48'
                    key={`${keyPrefix}-rank-${topItems[0].id}-0`}
                    item={topItems[0]}
                    rank={1}
                    showVoteChange={shouldShowVoteChange}
                    isAnimating={topItems[0].isAnimating && isInteractionEnabled}
                    voteChange={topItems[0].voteChange}
                    voteTotal={topItems[0].vote_total ?? 0}
                    enableMotionAnimations={true}
                  />
                </div>
              </div>
            </div>

            {/* 2위 - 오른쪽, 낮음 */}
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1 flex-1'>
              <div className='relative w-full max-w-[85px] sm:max-w-[100px] md:max-w-[110px]'>
                <div className='absolute -inset-0.5 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                  <VoteRankCard
                    className='w-full h-32 sm:h-36 md:h-40'
                    key={`${keyPrefix}-rank-${topItems[1].id}-1`}
                    item={topItems[1]}
                    rank={2}
                    showVoteChange={shouldShowVoteChange}
                    isAnimating={topItems[1].isAnimating && isInteractionEnabled}
                    voteChange={topItems[1].voteChange}
                    voteTotal={topItems[1].vote_total ?? 0}
                    enableMotionAnimations={true}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3명 있는 경우 기존 포디움 형식
  return (
    <div className={containerClass}>
      <div className='flex flex-col items-center justify-center'>
        {/* 포디움 형식 랭킹 카드 배치 */}
        <div className='flex justify-center items-end w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg gap-1 sm:gap-2 px-4 sm:px-6 mx-auto'>
          {/* 2위 - 왼쪽, 중간 높이 */}
          {topItems[1] && (
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1 flex-1'>
              <div className='relative w-full max-w-[85px] sm:max-w-[100px] md:max-w-[110px]'>
                <div className='absolute -inset-0.5 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                  <VoteRankCard
                    className='w-full h-32 sm:h-36 md:h-40'
                    key={`${keyPrefix}-rank-${topItems[1].id}-1`}
                    item={topItems[1]}
                    rank={2}
                    showVoteChange={shouldShowVoteChange}
                    isAnimating={topItems[1].isAnimating && isInteractionEnabled}
                    voteChange={topItems[1].voteChange}
                    voteTotal={topItems[1].vote_total ?? 0}
                    enableMotionAnimations={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 1위 - 가운데, 가장 높음 */}
          {topItems[0] && (
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10 flex-1'>
              <div className='relative w-full max-w-[100px] sm:max-w-[120px] md:max-w-[135px]'>
                <div className='absolute -inset-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                  <VoteRankCard
                    className='w-full h-40 sm:h-44 md:h-48'
                    key={`${keyPrefix}-rank-${topItems[0].id}-0`}
                    item={topItems[0]}
                    rank={1}
                    showVoteChange={shouldShowVoteChange}
                    isAnimating={topItems[0].isAnimating && isInteractionEnabled}
                    voteChange={topItems[0].voteChange}
                    voteTotal={topItems[0].vote_total ?? 0}
                    enableMotionAnimations={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3위 - 오른쪽, 가장 낮음 */}
          {topItems[2] && (
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1 flex-1'>
              <div className='relative w-full max-w-[75px] sm:max-w-[90px] md:max-w-[100px]'>
                <div className='absolute -inset-0.5 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                  <VoteRankCard
                    className='w-full h-28 sm:h-32 md:h-36'
                    key={`${keyPrefix}-rank-${topItems[2].id}-2`}
                    item={topItems[2]}
                    rank={3}
                    showVoteChange={shouldShowVoteChange}
                    isAnimating={topItems[2].isAnimating && isInteractionEnabled}
                    voteChange={topItems[2].voteChange}
                    voteTotal={topItems[2].vote_total ?? 0}
                    enableMotionAnimations={true}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
