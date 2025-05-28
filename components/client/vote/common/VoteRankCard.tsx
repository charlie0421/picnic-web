'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VoteItem } from '@/types/interfaces';
import { Badge } from '@/components/common';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useLanguageStore } from '@/stores/languageStore';
import { useRequireAuth } from '@/hooks/useAuthGuard';

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
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });
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

  // 카드 클릭 핸들러
  const handleCardClick = async (event: React.MouseEvent) => {
    // 이벤트 버블링 방지 - 상위 Link 컴포넌트의 클릭 이벤트가 실행되지 않도록 함
    event.stopPropagation();

    console.log('🎯 [VoteRankCard] 카드 클릭됨:', {
      itemId: item.id,
      rank,
      hasOnVoteChange: !!onVoteChange,
      timestamp: new Date().toISOString(),
    });

    // onVoteChange가 없으면 클릭 무시
    if (!onVoteChange) {
      console.log('❌ [VoteRankCard] onVoteChange가 없음 - 클릭 무시');
      return;
    }

    console.log('🔐 [VoteRankCard] 인증 체크 시작 - withAuth 호출');

    // 인증이 필요한 투표 액션을 실행
    const result = await withAuth(async () => {
      console.log('✅ [VoteRankCard] withAuth 내부 - 인증 성공, 투표 처리');

      // 실제 투표 로직은 상위 컴포넌트에서 처리
      // 여기서는 단순히 onVoteChange 콜백만 호출
      const currentTotal =
        voteTotal !== undefined ? voteTotal : item.vote_total || 0;
      const newTotal = currentTotal + 1; // 임시로 1 증가

      console.log('📊 [VoteRankCard] 투표 처리:', {
        currentTotal,
        newTotal,
        itemId: item.id,
      });

      onVoteChange(newTotal);
      return true;
    });

    console.log('🔍 [VoteRankCard] withAuth 결과:', result);

    // withAuth가 null을 반환하면 인증 실패 (로그인 다이얼로그 표시됨)
    if (!result) {
      console.log('❌ [VoteRankCard] 인증 실패 - 투표 처리하지 않음');
    } else {
      console.log('✅ [VoteRankCard] 인증 성공 - 투표 처리 완료');
    }
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
          image: 'md:w-32 md:h-32 sm:w-32 sm:h-32',
          padding: 'p-2 sm:p-3',
          name: 'text-sm',
          votes: 'text-sm',
        };
      case 2:
        return {
          image: 'w-24 h-24 sm:w-20 sm:h-20',
          padding: 'p-1 sm:p-2',
          name: 'text-xs',
          votes: 'text-xs',
        };
      case 3:
        return {
          image: 'w-10 h-10 sm:w-13 sm:h-13',
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

  const sizeClasses = getFullWidthSize();

  return (
    <div
      className={`relative flex flex-col justify-center items-center ${
        sizeClasses.padding
      } rounded-xl backdrop-blur-sm transform transition-all duration-300 overflow-hidden min-w-0 ${
        isAnimating ? 'animate-pulse' : ''
      } ${
        rank === 1
          ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300 shadow-xl'
          : rank === 2
          ? 'bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 shadow-lg'
          : 'bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-300 shadow-lg'
      } ${
        onVoteChange ? 'cursor-pointer hover:scale-105' : 'cursor-default'
      } ${className}`}
      onClick={handleCardClick}
    >
      {/* 이미지 */}
      <div
        className={`${sizeClasses.image} rounded-full overflow-hidden border border-white shadow-sm mx-auto flex-shrink-0`}
      >
        <img
          src={imageUrl}
          alt={artistName}
          className='w-full h-full object-cover'
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = '/images/default-artist.png';
            target.onerror = null;
          }}
        />
      </div>

      {/* 텍스트 그룹 - 하단 정렬 */}
      <div className='flex flex-col items-center mt-2 min-h-0 w-full overflow-hidden'>
        {/* 아티스트 이름 */}
        <h3
          className={`font-bold text-center ${sizeClasses.name} truncate w-full px-1 mb-1`}
        >
          {artistName}
        </h3>

        {/* 그룹 이름 (있는 경우) - 컴팩트/풀위스/심플 모드에서는 숨김 */}
        {item.artist?.artistGroup?.name && (
          <p className='text-xs text-gray-600 text-center truncate w-full px-1 mb-1'>
            {getLocalizedString(item.artist.artistGroup.name, currentLanguage)}
          </p>
        )}

        {/* 투표수 */}
        <div className='relative w-full'>
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
          <p
            className={`font-bold text-blue-600 ${sizeClasses.votes} truncate w-full px-1 text-center`}
          >
            {displayVoteTotal.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
