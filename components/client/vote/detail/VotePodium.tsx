'use client';

import React from 'react';
import { VoteItem } from '@/types/interfaces';
import { VoteRankCard } from '..';
import { formatCandidateVote, runnerUpGap, type VoteDisplayStatus } from '../common/vote-display-utils';
import { useLanguageStore } from '@/stores/languageStore';

interface VotePodiumProps {
  rankedItems: VoteItem[];
  renderTimer: () => React.ReactNode;
  headerHeight: number;
  totalVotes: number;
  voteStatus: VoteDisplayStatus;
  isAdmin: boolean;
}

export function VotePodium({ rankedItems, renderTimer, headerHeight, totalVotes, voteStatus, isAdmin }: VotePodiumProps) {
  const { t } = useLanguageStore();
  const display = (item: VoteItem) => formatCandidateVote({
    votes: item.vote_total,
    totalVotes,
    status: voteStatus,
    isAdmin,
  });

  const gap = runnerUpGap(rankedItems, voteStatus);
  const [gapNoticeShown, setGapNoticeShown] = React.useState(false);
  const [gapNoticeVisible, setGapNoticeVisible] = React.useState(true);
  // 표시 중 폴링으로 gap이 null이 되어도(동률/유일 2위 소멸) "0표 차이"로 오인되지 않도록
  // 최초 표시 시점의 gap 값을 고정한다. 안내가 갑자기 사라지지도 않는다.
  const [fixedGap, setFixedGap] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (gap !== null && !gapNoticeShown) {
      setGapNoticeShown(true); // 마운트(상세 진입)당 1회 — gap 값이 폴링으로 변해도 재표시하지 않음
      setFixedGap(gap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap]);
  React.useEffect(() => {
    if (!gapNoticeShown) return;
    const timer = setTimeout(() => setGapNoticeVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [gapNoticeShown]);

  return (
    <div className='sticky z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 py-2 md:py-3 mb-2 md:mb-4 shadow-lg' style={{ top: `${headerHeight}px` }}>
      <div className='container mx-auto px-4'>
        <div className='text-center mb-2 md:mb-3'>
          <div className='flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4'>
            <h2 className='text-lg md:text-xl font-bold bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-500 bg-clip-text text-transparent'>🏆 TOP 3</h2>
            <div className='flex items-center gap-3'>{renderTimer()}</div>
          </div>
        </div>
        <div className='flex justify-center items-end w-full max-w-4xl gap-1 sm:gap-2 md:gap-4 px-2 sm:px-4 mx-auto'>
          {rankedItems[1] && (
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
              <div className='relative'>
                {gapNoticeShown && gapNoticeVisible && (
                  <div className='absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-900/80 px-2 py-0.5 text-[10px] text-white'>
                    {t('vote_runner_up_gap_notice').replace('{gap}', (fixedGap ?? 0).toLocaleString('en-US'))}
                  </div>
                )}
                <div className='absolute -inset-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                  <VoteRankCard item={rankedItems[1]} rank={2} className='w-20 sm:w-24 md:w-28 lg:w-32' voteTotal={rankedItems[1].vote_total || 0} voteDisplay={display(rankedItems[1])} enableMotionAnimations={true} />
                </div>
              </div>
              <div className='mt-1 text-center'><div className='text-sm'>🥈</div></div>
            </div>
          )}
          {rankedItems[0] && (
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10'>
              <div className='relative'>
                <div className='absolute -inset-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                  <div className='absolute -top-0.5 -right-0.5 text-sm animate-bounce'>👑</div>
                  <VoteRankCard item={rankedItems[0]} rank={1} className='w-24 sm:w-32 md:w-36 lg:w-40' voteTotal={rankedItems[0].vote_total || 0} voteDisplay={display(rankedItems[0])} enableMotionAnimations={true} />
                </div>
              </div>
              <div className='mt-1 text-center'><div className='text-base font-bold animate-pulse'>🥇</div></div>
            </div>
          )}
          {rankedItems[2] && (
            <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
              <div className='relative'>
                <div className='absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                  <VoteRankCard item={rankedItems[2]} rank={3} className='w-18 sm:w-20 md:w-24 lg:w-28' voteTotal={rankedItems[2].vote_total || 0} voteDisplay={display(rankedItems[2])} enableMotionAnimations={true} />
                </div>
              </div>
              <div className='mt-1 text-center'><div className='text-sm'>🥉</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
