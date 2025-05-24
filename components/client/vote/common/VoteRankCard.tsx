'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VoteItem } from '@/types/interfaces';
import { Badge } from '@/components/common';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useLanguageStore } from '@/stores/languageStore';

export interface VoteRankCardProps {
  item: VoteItem & { artist?: any; rank?: number };
  rank: number;
  className?: string;
  showVoteChange?: boolean;
  voteChange?: number;
  isAnimating?: boolean;
  voteTotal?: number;
  onVoteChange?: (newTotal: number) => void;
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

  // 아티스트 이름 가져오기
  const artistName = item.artist
    ? getLocalizedString(item.artist.name, currentLanguage) || '아티스트'
    : '아티스트';

  // 아티스트 이미지 URL
  const imageUrl = item.artist?.image
    ? getCdnImageUrl(item.artist.image)
    : '/images/default-artist.png';

  // 투표수 결정 (voteTotal prop이 있으면 사용, 없으면 item.voteTotal 사용)
  const displayVoteTotal = voteTotal !== undefined ? voteTotal : (item.vote_total || 0);

  const getFullWidthSize = () => {
    switch (rank) {
      case 1:
        return {
          image: 'w-34 h-34',
          padding: 'p-1',
          name: 'text-sm',
          votes: 'text-sm'
        };
      case 2:
        return {
          image: 'w-22 h-22',
          name: 'text-xs',
          votes: 'text-xs'
        };
      case 3:
        return {
          image: 'w-13 h-13',
          name: 'text-xs',
          votes: 'text-xs'
        };
      default:
        return {
          image: 'w-12 h-12',
          name: 'text-xs',
          votes: 'text-xs'
        };
    }
  };

  const sizeClasses = getFullWidthSize();

  return (
    <div
      className={`relative flex flex-col justify-center items-center ${sizeClasses.padding} rounded-xl backdrop-blur-sm transform transition-all duration-300 overflow-hidden min-w-0 ${isAnimating ? 'animate-pulse' : ''
        } ${rank === 1
          ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 shadow-xl'
          : rank === 2
            ? 'bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 shadow-lg'
            : 'bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-300 shadow-lg'
        } ${className}`}
    >
      {/* 이미지 */}
      <div className={`${sizeClasses.image} rounded-full overflow-hidden border border-white shadow-sm mx-auto flex-shrink-0`}>
        <img
          src={imageUrl}
          alt={artistName}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/images/default-artist.png';
            target.onerror = null;
          }}
        />
      </div>

      {/* 텍스트 그룹 - 하단 정렬 */}
      <div className="flex flex-col items-center mt-2 min-h-0 w-full overflow-hidden">
        {/* 아티스트 이름 */}
        <h3 className={`font-bold text-center ${sizeClasses.name} truncate w-full px-1 mb-1`}>
          {artistName}
        </h3>

        {/* 그룹 이름 (있는 경우) - 컴팩트/풀위스/심플 모드에서는 숨김 */}
        {item.artist?.artistGroup?.name && (
          <p className="text-xs text-gray-600 truncate w-full px-1 mb-1">
            {getLocalizedString(item.artist.artistGroup.name, currentLanguage)}
          </p>
        )}

        {/* 투표수 */}
        <div className="relative w-full">
          {shouldShowVoteChange && (
            <div
              className={`absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${currentVoteChange > 0
                  ? 'bg-green-200 text-green-800'
                  : 'bg-red-200 text-red-800'
                } animate-bounce`}
            >
              {currentVoteChange > 0 ? '+' : ''}
              {currentVoteChange}
            </div>
          )}
          <p className={`font-bold text-blue-600 ${sizeClasses.votes} truncate w-full px-1 text-center`}>
            {displayVoteTotal.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
} 