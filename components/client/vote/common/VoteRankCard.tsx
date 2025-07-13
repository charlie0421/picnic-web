'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { VoteItem } from '@/types/interfaces';
import { Badge } from '@/components/common';
import { getLocalizedString, hasValidLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useLanguageStore } from '@/stores/languageStore';
import { AnimatedCount } from '@/components/ui/animations/RealtimeAnimations';

export interface VoteRankCardProps {
  item: VoteItem & {
    artist?: any;
    rank?: number;
    _realtimeInfo?: {
      isHighlighted?: boolean;
      rankChange?: 'up' | 'down' | 'same' | 'new';
      isNew?: boolean;
      isUpdated?: boolean;
    };
  };
  rank: number;
  className?: string;
  showVoteChange?: boolean;
  voteChange?: number;
  isAnimating?: boolean;
  voteTotal?: number;
  onVoteChange?: (newTotal: number) => void;
  onAuthenticatedVote?: () => Promise<void>;
  enableMotionAnimations?: boolean;
  // 새로운 props 추가
  mode?: 'list' | 'detail'; // 투표 리스트 모드 vs 투표 상세 모드
  onNavigateToDetail?: () => void; // 투표 상세로 이동하는 함수
}

export function VoteRankCard({
  item,
  rank,
  className = '',
  showVoteChange = false,
  voteChange = 0,
  isAnimating = false,
  voteTotal,
  onVoteChange,
  onAuthenticatedVote,
  enableMotionAnimations = true,
  mode = 'detail', // 기본값은 detail (기존 동작 유지)
  onNavigateToDetail,
}: VoteRankCardProps) {
  const { currentLanguage } = useLanguageStore();
  const [currentVoteChange, setCurrentVoteChange] = useState(voteChange);
  const [shouldShowVoteChange, setShouldShowVoteChange] = useState(false);

  // 투표 변경 애니메이션 처리
  useEffect(() => {
    if (voteChange && voteChange !== 0) {
      setCurrentVoteChange(voteChange);
      setShouldShowVoteChange(true);

      const timer = setTimeout(() => {
        setShouldShowVoteChange(false);
        setCurrentVoteChange(0);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [voteChange]);

  // 카드 클릭 핸들러 - 모드에 따라 다른 동작 수행
  const handleCardClick = async (event: React.MouseEvent) => {
    // 이벤트 버블링 방지 - 상위 Link 컴포넌트의 클릭 이벤트가 실행되지 않도록 함
    event.stopPropagation();

    console.log('🎯 [VoteRankCard] 카드 클릭됨:', {
      itemId: item.id,
      rank,
      mode,
      hasOnVoteChange: !!onVoteChange,
      hasOnAuthenticatedVote: !!onAuthenticatedVote,
      hasOnNavigateToDetail: !!onNavigateToDetail,
      timestamp: new Date().toISOString(),
    });

    // 투표 리스트 모드: 애니메이션 없이 투표 상세로 이동
    if (mode === 'list') {
      console.log('📋 [VoteRankCard] 리스트 모드 - 투표 상세로 이동');
      if (onNavigateToDetail) {
        onNavigateToDetail();
      }
      return;
    }

    // 투표 상세 모드: 기존 동작 (투표 다이얼로그 표시)
    console.log('📊 [VoteRankCard] 상세 모드 - 투표 처리');

    // onAuthenticatedVote가 있으면 우선 사용 (인증 처리가 상위에서 완료됨)
    if (onAuthenticatedVote) {
      console.log('🔐 [VoteRankCard] 인증된 투표 함수 호출');
      await onAuthenticatedVote();
      return;
    }

    // onVoteChange가 없으면 클릭 무시
    if (!onVoteChange) {
      console.log('❌ [VoteRankCard] 투표 함수가 없음 - 클릭 무시');
      return;
    }

    console.log('📊 [VoteRankCard] 직접 투표 처리 (인증 없음)');
    
    // 실제 투표 로직은 상위 컴포넌트에서 처리
    // 여기서는 단순히 onVoteChange 콜백만 호출
    const currentTotal = voteTotal !== undefined ? voteTotal : item.vote_total || 0;
    const newTotal = currentTotal + 1; // 임시로 1 증가

    console.log('📊 [VoteRankCard] 투표 처리:', {
      currentTotal,
      newTotal,
      itemId: item.id,
    });

    onVoteChange(newTotal);
  };

  // 아티스트 이름 가져오기
  const artistName = item.artist
    ? getLocalizedString(item.artist.name, currentLanguage) || '아티스트'
    : '아티스트';

  // 아티스트 이미지 URL
  const imageUrl = item.artist?.image
    ? getCdnImageUrl(item.artist.image)
    : '/images/default-artist.png';

  // 투표수 결정 (voteTotal prop이 있으면 사용, 없으면 item.voteTotal 사용)
  const displayVoteTotal =
    voteTotal !== undefined ? voteTotal : item.vote_total || 0;

  const getFullWidthSize = () => {
    switch (rank) {
      case 1:
        return {
          image: 'w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24',
          padding: 'p-1.5 sm:p-2',
          name: 'text-xs sm:text-sm',
          votes: 'text-xs sm:text-sm',
        };
      case 2:
        return {
          image: 'w-12 h-12 sm:w-16 sm:h-16 md:w-18 md:h-18',
          padding: 'p-1 sm:p-1.5',
          name: 'text-xs',
          votes: 'text-xs',
        };
      case 3:
        return {
          image: 'w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14',
          padding: 'p-1',
          name: 'text-xs',
          votes: 'text-xs',
        };
      default:
        return {
          image: 'w-12 h-12',
          padding: 'p-1',
          name: 'text-xs',
          votes: 'text-xs',
        };
    }
  };

  // 실시간 정보 추출
  const realtimeInfo = item._realtimeInfo;
  const isHighlighted = realtimeInfo?.isHighlighted;
  const rankChange = realtimeInfo?.rankChange;
  const isNew = realtimeInfo?.isNew;
  const isUpdated = realtimeInfo?.isUpdated;

  const sizeClasses = getFullWidthSize();

  // 애니메이션이 비활성화된 경우 기본 렌더링
  if (!enableMotionAnimations) {
    return (
      <div
        className={`relative flex flex-col justify-center items-center ${
          sizeClasses.padding
        } rounded-xl backdrop-blur-sm transform transition-all duration-300 overflow-hidden min-w-0 ${
          isAnimating ? 'animate-pulse' : ''
        } ${
          rank === 1
            ? `bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 ${
                isUpdated ? 'border-green-400 shadow-green-200' : 'border-yellow-300'
              } shadow-xl`
            : rank === 2
            ? `bg-gradient-to-br from-gray-50 to-gray-100 border ${
                isUpdated ? 'border-green-400 shadow-green-200' : 'border-gray-300'
              } shadow-lg`
            : `bg-gradient-to-br from-amber-50 to-amber-100 border ${
                isUpdated ? 'border-green-400 shadow-green-200' : 'border-amber-300'
              } shadow-lg`
        } ${
          onVoteChange || onAuthenticatedVote || onNavigateToDetail 
            ? mode === 'list' 
              ? 'cursor-pointer hover:scale-102' 
              : 'cursor-pointer hover:scale-105' 
            : 'cursor-default'
        } ${className}`}
        onClick={handleCardClick}
      >
        {/* 기본 컨텐츠... */}
        <div
          className={`${sizeClasses.image} rounded-full overflow-hidden border border-white shadow-sm mx-auto flex-shrink-0`}
        >
          <Image
            src={imageUrl}
            alt={artistName}
            width={100}
            height={100}
            className='w-full h-full object-cover'
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/images/default-artist.png';
              target.onerror = null;
            }}
          />
        </div>
        <div className='flex flex-col items-center mt-1 flex-1 w-full justify-end'>
          <h3
            className={`font-bold text-center text-gray-800 ${sizeClasses.name} w-full px-0.5 mb-0.5 leading-tight`}
            style={{ 
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {artistName}
          </h3>
          {item.artist?.artistGroup?.name && hasValidLocalizedString(item.artist.artistGroup.name) && (
            <p 
              className='text-xs text-gray-600 text-center w-full px-0.5 mb-0.5 leading-tight'
              style={{ 
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {getLocalizedString(
                item.artist.artistGroup.name,
                currentLanguage,
              )}
            </p>
          )}
          <div className='relative w-full'>
            {shouldShowVoteChange && (
              <div
                className={`absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                  currentVoteChange > 0
                    ? 'bg-green-200 text-green-800'
                    : 'bg-red-200 text-red-800'
                } animate-bounce`}
              >
                {currentVoteChange > 0 ? '+' : ''}
                {currentVoteChange}
              </div>
            )}
            <p
              className={`font-bold ${
                isUpdated ? 'text-green-600' : 'text-blue-600'
              } ${sizeClasses.votes} w-full px-0.5 text-center transition-all duration-300 leading-tight ${
                isUpdated ? 'scale-110' : 'scale-100'
              }`}
            >
              <AnimatedCount
                value={displayVoteTotal}
                suffix=''
                className='font-inherit'
              />
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Framer Motion을 사용한 애니메이션 렌더링
  return (
    <motion.div
      layout
      layoutId={`vote-card-${item.id}`}
      className={`relative flex flex-col justify-center items-center ${
        sizeClasses.padding
      } rounded-xl backdrop-blur-sm overflow-hidden min-w-0 ${
        rank === 1
          ? `bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 ${
              isUpdated ? 'border-green-400 shadow-green-200' : 'border-yellow-300'
            } shadow-xl`
          : rank === 2
          ? `bg-gradient-to-br from-gray-50 to-gray-100 border ${
              isUpdated ? 'border-green-400 shadow-green-200' : 'border-gray-300'
            } shadow-lg`
          : `bg-gradient-to-br from-amber-50 to-amber-100 border ${
              isUpdated ? 'border-green-400 shadow-green-200' : 'border-amber-300'
            } shadow-lg`
      } ${onVoteChange || onAuthenticatedVote || onNavigateToDetail ? 'cursor-pointer' : 'cursor-default'} ${className}`}
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
        (onVoteChange || onAuthenticatedVote || onNavigateToDetail) && mode === 'detail'
          ? {
              scale: 1.05,
              y: -4,
              transition: { duration: 0.2 },
            }
          : mode === 'list' && onNavigateToDetail
          ? {
              scale: 1.02,
              transition: { duration: 0.15 },
            }
          : {}
      }
      whileTap={
        (onVoteChange || onAuthenticatedVote || onNavigateToDetail)
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
          duration: isHighlighted ? 0.3 : 0.8, // 사라질 때는 더 천천히
          ease: isHighlighted ? "easeOut" : "easeInOut"
        },
        boxShadow: {
          duration: isHighlighted ? 0.2 : 0.6, // 그림자도 부드럽게 사라지기
          ease: "easeInOut"
        }
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
                ease: "easeInOut",
                opacity: { duration: 0.6 },
                scale: { duration: 0.8, ease: "easeOut" }
              }
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
          <Image
            src={imageUrl}
            alt={artistName}
            width={100}
            height={100}
            className='w-full h-full object-cover'
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/images/default-artist.png';
              target.onerror = null;
            }}
          />
        </motion.div>
      </motion.div>

      {/* 텍스트 그룹 - 하단 정렬 */}
      <div className='flex flex-col items-center mt-1 flex-1 w-full justify-end relative z-[1]'>
        {/* 아티스트 이름 */}
        <motion.h3
          className={`font-bold text-center text-gray-800 ${sizeClasses.name} w-full px-0.5 mb-0.5 leading-tight`}
          style={{ 
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {artistName}
        </motion.h3>

        {/* 그룹 이름 (있는 경우) */}
        {item.artist?.artistGroup?.name && hasValidLocalizedString(item.artist.artistGroup.name) && (
          <motion.p
            className='text-xs text-gray-600 text-center w-full px-0.5 mb-0.5 leading-tight'
            style={{ 
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
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
                className={`absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap z-20 ${
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
            className={`font-bold text-blue-600 ${sizeClasses.votes} w-full px-0.5 text-center leading-tight`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              scale: isUpdated ? 1.1 : 1,
            }}
            transition={{ 
              delay: 0.3,
              scale: { 
                duration: isUpdated ? 0.3 : 0.6, // 사라질 때는 더 느리게
                ease: isUpdated ? "easeOut" : "easeInOut",
                type: "spring",
                stiffness: isUpdated ? 400 : 200, // 사라질 때는 더 부드럽게
                damping: isUpdated ? 20 : 30
              }
            }}
          >
            <AnimatedCount
              key={`vote-count-${item.id}-${isUpdated ? 'updated' : 'normal'}`}
              value={displayVoteTotal}
              suffix=''
              className={`font-inherit transition-all duration-700 ease-in-out ${
                isUpdated ? 'text-green-600' : 'text-blue-600'
              }`}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
