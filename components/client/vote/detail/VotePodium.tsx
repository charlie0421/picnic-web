'use client';

import React from 'react';
import { VoteItem } from '@/types/interfaces';
import { VoteRankCard } from '..';
import { formatCandidateVote, type VoteDisplayStatus } from '../common/vote-display-utils';

interface VotePodiumProps {
  rankedItems: VoteItem[];
  renderTimer: () => React.ReactNode;
  headerHeight: number;
  totalVotes: number;
  voteStatus: VoteDisplayStatus;
  isAdmin: boolean;
}

export function VotePodium({ rankedItems, renderTimer, headerHeight, totalVotes, voteStatus, isAdmin }: VotePodiumProps) {
  const display = (item: VoteItem) => formatCandidateVote({
    votes: item.vote_total,
    totalVotes,
    status: voteStatus,
    isAdmin,
  });
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
