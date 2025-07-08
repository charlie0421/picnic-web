'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

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
  cardSize?: 'sm' | 'md' | 'lg';
  enablePagination?: boolean;
  itemsPerPage?: number;
  enableShuffle?: boolean;
  style?: 'circular' | 'card';
}

export const GridView: React.FC<GridViewProps> = ({
  items,
  disabled = false,
  showVoteChange = false,
  onVoteChange,
  keyPrefix = 'grid',
  cardSize = 'md',
  enablePagination = false,
  itemsPerPage = 12,
  enableShuffle = false,
  style = 'circular',
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [shuffledItems, setShuffledItems] = useState<Array<EnhancedVoteItem>>(
    [],
  );
  const [mounted, setMounted] = useState(false);

  const effectiveItems = useMemo(() => items || [], [items]);
  const totalPages = enablePagination
    ? Math.ceil(effectiveItems.length / itemsPerPage)
    : 1;

  useEffect(() => {
    setMounted(true);
  }, []);

  // 아이템을 랜덤으로 섞는 함수
  const shuffleItems = (itemsToShuffle: Array<EnhancedVoteItem>) => {
    const shuffled = [...itemsToShuffle];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // 컴포넌트가 마운트된 후에만 랜덤으로 섞기
  useEffect(() => {
    if (mounted && effectiveItems.length > 0) {
      if (enableShuffle) {
        setShuffledItems(shuffleItems(effectiveItems));
      } else {
        setShuffledItems(effectiveItems);
      }
    }
  }, [mounted, effectiveItems, enableShuffle]);

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  // 현재 페이지의 아이템들
  const getCurrentItems = () => {
    const sourceItems =
      mounted && enableShuffle ? shuffledItems : effectiveItems;

    if (enablePagination) {
      return sourceItems.slice(
        currentPage * itemsPerPage,
        (currentPage + 1) * itemsPerPage,
      );
    }
    return sourceItems;
  };

  const currentItems = getCurrentItems();

  if (effectiveItems.length === 0) {
    return null;
  }

  // 카드 크기 설정 - 반응형
  const getCardSizeClass = () => {
    switch (cardSize) {
      case 'sm':
        return 'w-12 h-16 md:w-16 md:h-20';
      case 'lg':
        return 'w-20 h-28 md:w-32 md:h-40';
      case 'md':
      default:
        return 'w-16 h-24 md:w-24 md:h-32';
    }
  };

  // 그리드 컬럼 클래스 설정 - 반응형
  const getGridColumns = () => {
    if (style === 'circular') {
      // 원형 스타일: 모바일 4개, sm 이상 5개
      return 'grid-cols-4 sm:grid-cols-5 md:grid-cols-5';
    }
    // 카드 스타일: 모바일 5개, md 이상 4개
    return 'grid-cols-5 md:grid-cols-4';
  };

  const gridColumnsClass = getGridColumns();

  // 원형 스타일 렌더링
  const renderCircularStyle = () => (
    <div className='flex flex-col' suppressHydrationWarning>
      <div className={`grid ${gridColumnsClass} gap-1`}>
        {currentItems.map((item, index) => (
          <div
            key={`${keyPrefix}-${item.id}-${index}`}
            className='relative aspect-square'
          >
            <div className='w-full h-full rounded-full overflow-hidden relative'>
              <OptimizedImage
                src={item.artist?.image || '/images/default-artist.png'}
                alt={getLocalizedString(item.artist?.name) || '아티스트 이미지'}
                fill
                sizes='(max-width: 768px) 25vw, (max-width: 1200px) 20vw, 15vw'
                className='object-cover'
                priority={false}
                progressive={true}
                placeholder='skeleton'
                quality={80}
                intersectionThreshold={0.1}
              />
            </div>
            <div className='absolute bottom-0 left-0 right-0 text-center mt-1'>
              <p className='text-gray-800 text-xs font-medium truncate bg-white/80 rounded-full py-1 px-1 mx-1'>
                {getLocalizedString(item.artist?.name) || '아티스트'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {enablePagination && totalPages > 1 && (
        <div className='flex justify-center items-center mt-4 space-x-4'>
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className='p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              viewBox='0 0 20 20'
              fill='currentColor'
            >
              <path
                fillRule='evenodd'
                d='M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z'
                clipRule='evenodd'
              />
            </svg>
          </button>

          <span className='text-sm text-gray-600'>
            {currentPage + 1} / {totalPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages - 1}
            className='p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              viewBox='0 0 20 20'
              fill='currentColor'
            >
              <path
                fillRule='evenodd'
                d='M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z'
                clipRule='evenodd'
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  // 카드 스타일 렌더링 (기존 기능 유지)
  const renderCardStyle = () => {
    // 기존 VoteRankCard를 사용하는 로직은 별도 컴포넌트로 분리하는 것이 좋습니다
    // 여기서는 간단한 카드 스타일만 구현
    const cardSizeClass = getCardSizeClass();

    return (
      <div
        className={`w-full ${
          disabled ? 'opacity-70 grayscale pointer-events-none select-none' : ''
        }`}
      >
        <div
          className={`grid ${gridColumnsClass} gap-2 md:gap-4 justify-items-center`}
        >
          {currentItems.map((item, index) => (
            <div
              key={`${keyPrefix}-${item.id}-${index}`}
              className='flex flex-col items-center'
            >
              <div
                className={`${cardSizeClass} relative rounded-lg overflow-hidden border border-gray-200`}
              >
                <OptimizedImage
                  src={item.artist?.image || '/images/default-artist.png'}
                  alt={getLocalizedString(item.artist?.name) || '아티스트 이미지'}
                  fill
                  sizes='(max-width: 768px) 20vw, (max-width: 1200px) 15vw, 10vw'
                  className='object-cover'
                  priority={false}
                  progressive={true}
                  placeholder='skeleton'
                  quality={85}
                  intersectionThreshold={0.1}
                />
              </div>
              <p className='text-xs font-medium text-center truncate w-full mt-1'>
                {getLocalizedString(item.artist?.name) || '아티스트'}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return style === 'circular' ? renderCircularStyle() : renderCardStyle();
};
