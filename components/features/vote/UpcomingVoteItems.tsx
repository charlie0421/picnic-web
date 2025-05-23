'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { VoteItem } from '@/types/interfaces';
import { getCdnImageUrl } from '@/utils/api/image';
import { getLocalizedString } from '@/utils/api/strings';

interface UpcomingVoteItemsProps {
  voteItem?: Array<VoteItem & { artist?: any }>;
  voteItems?: Array<VoteItem & { artist?: any }>; // 이전 속성명 호환성 유지
}

const UpcomingVoteItems: React.FC<UpcomingVoteItemsProps> = ({
  voteItem,
  voteItems,
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [shuffledItems, setShuffledItems] = useState<
    Array<VoteItem & { artist?: any }>
  >([]);
  const [mounted, setMounted] = useState(false);
  const itemsPerPage = 12; // 한 페이지당 3줄 x 4개

  // 두 속성 모두 확인하여 유효한 항목 사용 (voteItem을 우선)
  const effectiveItems = voteItem || voteItems || [];

  console.log('[UpcomingVoteItems] 렌더링:', {
    voteItemCount: voteItem?.length || 0,
    voteItemsCount: voteItems?.length || 0,
    effectiveItemsCount: effectiveItems.length,
    mounted,
  });

  const totalPages = Math.ceil(effectiveItems.length / itemsPerPage);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 투표아이템을 랜덤으로 섞는 함수
  const shuffleItems = (items: Array<VoteItem & { artist?: any }>) => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // 컴포넌트가 마운트된 후에만 랜덤으로 섞기
  useEffect(() => {
    if (mounted && effectiveItems.length > 0) {
      console.log('[UpcomingVoteItems] 아이템 섞기:', effectiveItems.length);
      setShuffledItems(shuffleItems(effectiveItems));
    }
  }, [mounted, effectiveItems]);

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

  const currentItems = mounted
    ? shuffledItems.slice(
        currentPage * itemsPerPage,
        (currentPage + 1) * itemsPerPage,
      )
    : effectiveItems.slice(0, itemsPerPage);

  console.log('[UpcomingVoteItems] 현재 표시할 아이템:', currentItems.length);

  if (effectiveItems.length === 0) {
    console.log('[UpcomingVoteItems] 표시할 아이템 없음');
    return null;
  }

  return (
    <div className='flex flex-col'>
      <div className='grid grid-cols-4 md:grid-cols-4 gap-1'>
        {currentItems.map((item) => (
          <div key={item.id} className='relative aspect-square'>
            <div className='w-full h-full rounded-full overflow-hidden relative'>
              <Image
                src={getCdnImageUrl(item.artist?.image, 300)}
                alt={getLocalizedString(item.artist?.name) || '아티스트 이미지'}
                fill
                sizes='(max-width: 768px) 25vw, (max-width: 1200px) 20vw, 15vw'
                className='object-cover'
                loading='lazy'
                onError={(e) => {
                  // 이미지 로드 실패 시 기본 이미지로 대체
                  console.log(`아티스트 이미지 로드 실패:`, {
                    id: item.id,
                    artist: getLocalizedString(item.artist?.name) || 'unknown',
                  });
                  e.currentTarget.src = '/images/default-artist.png';
                }}
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

      {totalPages > 1 && (
        <div className='flex justify-center items-center my-1 py-0 gap-2'>
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className='p-2 rounded-full bg-gray-100 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200'
            aria-label='이전 페이지'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </button>

          <span className='text-sm text-gray-500'>
            {currentPage + 1} / {totalPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages - 1}
            className='p-2 rounded-full bg-gray-100 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200'
            aria-label='다음 페이지'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-5 w-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 5l7 7-7 7'
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default UpcomingVoteItems;
