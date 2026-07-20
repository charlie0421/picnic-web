'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { AnimatedCount } from '@/components/ui/animations/RealtimeAnimations';
import { getLocalizedString } from '@/utils/api/strings';
import { getRankStyles } from './vote-rank-card-utils';

export interface VoteRankCardAnimatedProps {
  item: {
    id: string | number;
    artist?: any;
    vote_total?: number | null;
  };
  rank: number;
  sizeClasses: {
    image: string;
    padding: string;
    name: string;
    votes: string;
  };
  artistName: string;
  imageSrc: string | null;
  displayVoteTotal: number;
  voteDisplay?: string;
  currentVoteChange: number;
  shouldShowVoteChange: boolean;
  isHighlighted?: boolean;
  rankChange?: 'up' | 'down' | 'same' | 'new';
  isNew?: boolean;
  isUpdated?: boolean;
  isAnimating: boolean;
  onVoteChange?: (newTotal: number) => void;
  handleCardClick: (event: React.MouseEvent) => void;
  className: string;
  currentLanguage: string;
}

export default function VoteRankCardAnimated({
  item,
  rank,
  sizeClasses,
  artistName,
  imageSrc,
  displayVoteTotal,
  voteDisplay,
  currentVoteChange,
  shouldShowVoteChange,
  isHighlighted,
  rankChange,
  isNew,
  isUpdated,
  isAnimating,
  onVoteChange,
  handleCardClick,
  className,
  currentLanguage,
}: VoteRankCardAnimatedProps) {
  return (
    <motion.div
      layout
      layoutId={`vote-card-${item.id}`}
      className={`relative flex flex-col justify-center items-center ${
        sizeClasses.padding
      } rounded-xl backdrop-blur-sm overflow-hidden min-w-0 ${getRankStyles(
        rank,
        isUpdated,
      )} ${onVoteChange ? 'cursor-pointer' : 'cursor-default'} ${className}`}
      onClick={handleCardClick}
      initial={{ scale: 1, y: 0 }}
      animate={{
        scale: isAnimating ? 1.05 : 1,
        y: isHighlighted ? -2 : 0,
        boxShadow: isHighlighted
          ? '0 8px 25px -5px rgba(59, 130, 246, 0.4)'
          : rank === 1
          ? '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
          : '0 4px 15px -3px rgba(0, 0, 0, 0.1)',
      }}
      whileHover={
        onVoteChange
          ? {
              scale: 1.05,
              y: -4,
              transition: { duration: 0.2 },
            }
          : {}
      }
      whileTap={
        onVoteChange
          ? {
              scale: 0.98,
              transition: { duration: 0.1 },
            }
          : {}
      }
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        y: {
          duration: isHighlighted ? 0.3 : 0.8,
          ease: isHighlighted ? 'easeOut' : 'easeInOut',
        },
        boxShadow: {
          duration: isHighlighted ? 0.2 : 0.6,
          ease: 'easeInOut',
        },
      }}
    >
      {/* 실시간 하이라이트 배경 */}
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              transition: {
                duration: 0.8,
                ease: 'easeInOut',
                opacity: { duration: 0.6 },
                scale: { duration: 0.8, ease: 'easeOut' },
              },
            }}
            transition={{ duration: 0.3 }}
            className='absolute inset-0 bg-gradient-to-r from-blue-100/50 to-indigo-100/50 rounded-xl border border-blue-300'
          />
        )}
      </AnimatePresence>

      {/* 랭킹 변경 인디케이터 */}
      <AnimatePresence>
        {rankChange && rankChange !== 'same' && (
          <motion.div
            initial={{ opacity: 0, scale: 0, rotate: -180 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0, rotate: 180 }}
            transition={{ type: 'spring', stiffness: 600, damping: 25 }}
            className='absolute -top-1 -right-1 z-10'
          >
            {rankChange === 'up' && (
              <div className='bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold'>
                ↗
              </div>
            )}
            {rankChange === 'down' && (
              <div className='bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold'>
                ↘
              </div>
            )}
            {rankChange === 'new' && (
              <div className='bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold'>
                ✨
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 이미지 */}
      <motion.div
        className={`${sizeClasses.image} rounded-full overflow-hidden border border-white shadow-sm mx-auto flex-shrink-0 relative z-[1]`}
        whileHover={{ scale: 1.1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <motion.div
          className={`${sizeClasses.image} rounded-full overflow-hidden border border-white shadow-sm mx-auto flex-shrink-0`}
        >
          <OptimizedImage
            src={imageSrc || '/images/default-artist.png'}
            alt={artistName}
            width={100}
            height={100}
            className='w-full h-full object-cover'
            fallbackSrc='/images/default-artist.png'
          />
        </motion.div>
      </motion.div>

      {/* 텍스트 그룹 - 하단 정렬 */}
      <div className='flex flex-col items-center mt-2 min-h-0 w-full overflow-hidden relative z-[1]'>
        {/* 아티스트 이름 */}
        <motion.h3
          className={`font-bold text-center ${sizeClasses.name} truncate w-full px-1 mb-1 text-gray-900`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {artistName}
        </motion.h3>

        {/* 그룹 이름 (있는 경우) */}
        {item.artist?.artistGroup?.name && (
          <motion.p
            className='text-xs text-gray-600 text-center truncate w-full px-1 mb-1'
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {getLocalizedString(item.artist.artistGroup.name, currentLanguage)}
          </motion.p>
        )}

        {/* 투표수 */}
        <div className='relative w-full'>
          <AnimatePresence>
            {shouldShowVoteChange && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: -10 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className={`absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap z-20 ${
                  currentVoteChange > 0
                    ? 'bg-green-200 text-green-800'
                    : 'bg-red-200 text-red-800'
                }`}
              >
                {currentVoteChange > 0 ? '+' : ''}
                {currentVoteChange}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className={`font-bold text-blue-600 ${sizeClasses.votes} truncate w-full px-1 text-center`}
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: isUpdated ? 1.1 : 1,
            }}
            transition={{
              delay: 0.3,
              scale: {
                duration: isUpdated ? 0.3 : 0.6,
                ease: isUpdated ? 'easeOut' : 'easeInOut',
                type: 'spring',
                stiffness: isUpdated ? 400 : 200,
                damping: isUpdated ? 20 : 30,
              },
            }}
          >
            {voteDisplay ?? (
              <AnimatedCount
                key={`vote-count-${item.id}-${isUpdated ? 'updated' : 'normal'}`}
                value={displayVoteTotal}
                suffix=''
                className={`font-inherit transition-all duration-700 ease-in-out ${
                  isUpdated ? 'text-green-600' : 'text-blue-600'
                }`}
              />
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
