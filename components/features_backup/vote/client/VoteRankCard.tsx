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

  const RANK_BADGE_COLORS = {
    1: 'from-yellow-400 to-yellow-600',
    2: 'from-gray-300 to-gray-400',
    3: 'from-amber-500 to-amber-700',
  };

  const RANK_BADGES = {
    1: '🥇',
    2: '🥈',
    3: '🥉',
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
  const displayVoteTotal = voteTotal !== undefined ? voteTotal : (item.vote_total || 0);

  return (
    <div
      className={`relative flex flex-col items-center p-4 rounded-xl backdrop-blur-sm transform transition-all duration-300 ${
        isAnimating ? 'animate-pulse' : ''
      } ${
        rank === 1
          ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 shadow-xl'
          : rank === 2
          ? 'bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 shadow-lg'
          : 'bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-300 shadow-lg'
      } ${className}`}
    >
      {/* 랭크 배지 */}
      <div className="mb-2">
        <Badge 
          variant={rank === 1 ? 'warning' : rank === 2 ? 'default' : 'warning'}
          size="lg"
          className={`bg-gradient-to-br ${RANK_BADGE_COLORS[rank as keyof typeof RANK_BADGE_COLORS] || 'from-gray-400 to-gray-600'}`}
        >
          <span className="text-lg mr-1">{RANK_BADGES[rank as keyof typeof RANK_BADGES] || rank}</span>
          <span className="font-bold">{rank}위</span>
        </Badge>
      </div>

      {/* 이미지 */}
      <div className="w-20 h-20 rounded-full overflow-hidden mb-3 border-4 border-white shadow-md">
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

      {/* 아티스트 이름 */}
      <h3 className="font-bold text-center mb-1">{artistName}</h3>
      
      {/* 그룹 이름 (있는 경우) */}
      {item.artist?.artistGroup?.name && (
        <p className="text-sm text-gray-600 mb-2">
          {getLocalizedString(item.artist.artistGroup.name, currentLanguage)}
        </p>
      )}
      
      {/* 투표수 */}
      <div className="relative">
        {shouldShowVoteChange && (
          <div
            className={`absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
              currentVoteChange > 0
                ? 'bg-green-200 text-green-800'
                : 'bg-red-200 text-red-800'
            } animate-bounce`}
          >
            {currentVoteChange > 0 ? '+' : ''}
            {currentVoteChange}
          </div>
        )}
        <p className="text-xl font-bold text-blue-600">
          {displayVoteTotal.toLocaleString()}
        </p>
      </div>
    </div>
  );
} 