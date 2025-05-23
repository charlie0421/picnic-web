'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { useLanguageStore } from '@/stores/languageStore';
import { DefaultAvatar } from '@/components/ui/ProfileImageContainer';
import { getCdnImageUrl } from '@/utils/api/image';

interface VoteRankCardProps {
  item: VoteItem & { artist?: any };
  rank: number;
  className?: string;
  showVoteChange?: boolean;
  voteChange?: number;
  voteTotal?: number;
  onVoteChange?: (voteTotal: number) => void;
  isAnimating?: boolean;
}

const VoteRankCard: React.FC<VoteRankCardProps> = ({
  item,
  rank,
  className = '',
  showVoteChange = false,
  voteChange = 0,
  voteTotal,
  onVoteChange,
  isAnimating = false,
}) => {
  const { t } = useLanguageStore();
  // 외부에서 제공된 voteTotal 값 사용 또는 기본값
  const initialVoteTotal =
    voteTotal !== undefined ? voteTotal : item.voteTotal ?? 0;
  const [localVoteTotal, setLocalVoteTotal] = useState(initialVoteTotal);

  // 애니메이션 관련 상태
  const [currentVoteChange, setCurrentVoteChange] = useState(voteChange);
  const processedVoteTotals = useRef<Set<number>>(new Set([initialVoteTotal]));
  const prevVoteTotal = useRef(initialVoteTotal);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    console.log(`[VoteRankCard] 마운트 - 순위 ${rank}위:`, {
      id: item.id,
      artistName: item.artist?.name?.ko || '이름 없음',
      initialVoteTotal,
      currentVoteTotal: localVoteTotal,
    });

    // 클린업 함수 - 언마운트 시 모든 타이머 정리
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // 외부에서 voteTotal이 변경되면 로컬 상태 업데이트
  useEffect(() => {
    // 외부 voteTotal이 있고 현재 로컬 상태와 다른 경우에만 업데이트
    if (voteTotal !== undefined && voteTotal !== localVoteTotal) {
      console.log(`[VoteRankCard] 투표수 업데이트 - 순위 ${rank}위:`, {
        id: item.id,
        fromTotal: localVoteTotal,
        toTotal: voteTotal,
        change: voteTotal - localVoteTotal,
      });

      setLocalVoteTotal(voteTotal);

      // 처리된 투표수 목록에 추가 (중복 처리 방지)
      processedVoteTotals.current.add(voteTotal);
      prevVoteTotal.current = voteTotal;
    }
  }, [voteTotal, rank, item.id]);

  // 외부에서 voteChange가 제공되었을 때 업데이트
  useEffect(() => {
    if (voteChange !== 0) {
      setCurrentVoteChange(voteChange);

      // 애니메이션 타이머 설정 (기존 타이머 정리 후)
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      // 1초 후 애니메이션 종료
      animationTimeoutRef.current = setTimeout(() => {
        setCurrentVoteChange(0);
        animationTimeoutRef.current = null;
      }, 1000);
    }
  }, [voteChange]);

  // 부모 컴포넌트에 초기값 전달 (한 번만 실행)
  useEffect(() => {
    if (
      onVoteChange &&
      localVoteTotal !== undefined &&
      !processedVoteTotals.current.has(localVoteTotal)
    ) {
      console.log(
        `[VoteRankCard] 초기 투표수 전달 - 순위 ${rank}위:`,
        localVoteTotal,
      );
      onVoteChange(localVoteTotal);
      processedVoteTotals.current.add(localVoteTotal);
    }
  }, [localVoteTotal, onVoteChange, rank]);

  // 투표수 변화가 있고 애니메이션 중일 때만 변화량 표시
  const shouldShowVoteChange =
    isAnimating && currentVoteChange !== 0 && showVoteChange;

  const RANK_BADGE_COLORS = [
    'bg-gradient-to-br from-yellow-400/70 to-yellow-600/70 shadow-lg',
    'bg-gradient-to-br from-gray-300/70 to-gray-400/70 shadow-md',
    'bg-gradient-to-br from-amber-500/70 to-amber-700/70 shadow-sm',
  ];

  const RANK_BADGE_ICONS = ['👑', '🥈', '🥉'];
  const RANK_TEXTS = ['1st', '2nd', '3rd'];

  // 2:1.5:1 비율에 따른 카드 클래스 결정
  const getCardWidthClass = (rankNum: number): string => {
    // 너비를 더 확실하게 구분하여 시각적으로 차별화
    if (rankNum === 1) return 'w-[50%] h-auto'; // 더 넓게 설정
    if (rankNum === 2) return 'w-[35%] h-auto'; // 중간 크기
    return 'w-[30%] h-auto'; // 가장 작은 크기
  };

  // className에 너비 클래스가 포함되어 있으면 기본 너비 클래스를 사용하지 않음
  const hasWidthClass = className.includes('w-');
  const cardWidthClass = hasWidthClass ? '' : getCardWidthClass(rank);

  useEffect(() => {
    console.log(`[VoteRankCard] 렌더링 - 순위 ${rank}위:`, {
      artistName: item.artist?.name?.ko || '이름 없음',
      voteTotal: localVoteTotal,
      hasImage: !!item.artist?.image,
      className: cardWidthClass,
    });
  }, [rank, item, localVoteTotal, cardWidthClass]);

  return (
    <div
      className={`relative flex flex-col justify-between items-center p-0 rounded-xl backdrop-blur-sm transform transition-all duration-300 overflow-hidden self-end ${
        isAnimating ? 'animate-pulse' : ''
      } ${
        rank === 1
          ? 'bg-gradient-to-br from-yellow-50/80 to-yellow-100/80 border-2 border-yellow-300/80 order-2 z-10 scale-110 shadow-xl'
          : rank === 2
          ? 'bg-gradient-to-br from-gray-50/80 to-gray-100/80 border border-gray-300/70 order-1 z-5 scale-100 shadow-lg'
          : 'bg-gradient-to-br from-amber-50/80 to-amber-100/80 border border-amber-300/70 order-3 z-5 scale-100 shadow-lg'
      } ${cardWidthClass} ${className}`}
    >
      {/* 컨텐츠 컨테이너 */}
      <div className='flex flex-col justify-between w-full h-full'>
        {/* 상단 영역 - 랭크 태그 */}
        <div className='w-full flex justify-center pt-2 pb-1'>
          <div
            className={`py-1 px-2.5 rounded-full text-xs font-bold shadow-lg flex items-center justify-center space-x-1 whitespace-nowrap ${
              RANK_BADGE_COLORS[rank - 1]
            }`}
          >
            <span className='text-sm'>{RANK_BADGE_ICONS[rank - 1]}</span>
            <span>{RANK_TEXTS[rank - 1]}</span>
          </div>
        </div>

        {/* 이미지 영역 */}
        <div className='w-full mx-auto mt-1 mb-2 px-1'>
          <div className='aspect-square relative'>
            <div className='absolute inset-0 rounded-full overflow-hidden border-4 border-yellow-200/50 shadow-lg'>
              {item.artist && item.artist.image ? (
                <img
                  src={getCdnImageUrl(item.artist.image)}
                  alt={getLocalizedString(item.artist.name)}
                  className='w-full h-full object-cover'
                  loading={rank <= 3 ? 'eager' : 'lazy'} // 상위 3개 항목은 우선 로드
                  onError={(e) => {
                    console.error(`이미지 로드 오류: ${item.artist.image}`);
                    const target = e.target as HTMLImageElement;
                    target.src = '/images/default-artist.png';
                    target.onerror = null; // 추가 오류 방지
                  }}
                />
              ) : (
                <div className='w-full h-full bg-gray-200 flex items-center justify-center'>
                  <DefaultAvatar width={100} height={100} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 하단 정보 */}
        <div className='w-full text-center mb-2 px-1 flex-1 flex flex-col justify-center'>
          <div className='flex flex-col space-y-1'>
            <div
              className={`font-bold flex items-center justify-center overflow-hidden min-w-0 max-w-full ${
                rank === 1
                  ? 'text-sm text-yellow-700/70'
                  : 'text-xs text-gray-700/70'
              }`}
            >
              <span className='truncate overflow-ellipsis max-w-full'>
                {item.artist
                  ? getLocalizedString(item.artist.name) ||
                    '알 수 없는 아티스트'
                  : '알 수 없는 아티스트'}
              </span>
            </div>
            <div className='flex items-center justify-center overflow-hidden min-w-0 max-w-full'>
              {item.artist?.artist_group ? (
                <span className='text-[10px] text-gray-600 truncate overflow-ellipsis max-w-full'>
                  {getLocalizedString(item.artist.artist_group.name)}
                </span>
              ) : (
                <span className='text-[10px] text-transparent select-none'>
                  -
                </span>
              )}
            </div>
            <div className='flex items-center justify-center font-bold overflow-hidden min-w-0 max-w-full'>
              <div className='relative w-full flex items-center justify-center'>
                {shouldShowVoteChange && (
                  <div
                    className={`absolute -top-4 left-1/2 -translate-x-1/2 min-w-[20px] px-1 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap z-10 ${
                      currentVoteChange > 0
                        ? 'bg-green-200 text-green-800 border border-green-300'
                        : 'bg-red-200 text-red-800 border border-red-300'
                    } animate-bounce shadow-sm`}
                  >
                    {currentVoteChange > 0 ? '+' : ''}
                    {currentVoteChange}
                  </div>
                )}
                <span
                  className={
                    rank === 1
                      ? 'text-sm text-yellow-600/70'
                      : rank === 2
                      ? 'text-xs text-amber-600/70'
                      : 'text-xs text-amber-600/70 font-bold'
                  }
                >
                  {localVoteTotal.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoteRankCard;
