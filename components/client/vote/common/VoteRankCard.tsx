'use client';

import React, { useEffect, useState } from 'react';
import { getLocalizedString } from '@/utils/api/strings';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useLanguageStore } from '@/stores/languageStore';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { AnimatedCount } from '@/components/ui/animations/RealtimeAnimations';
import {
  VOTE_CHANGE_ANIMATION_MS,
  VoteRankCardProps,
  getFullWidthSize,
  getRankStyles,
} from './vote-rank-card-utils';
import VoteRankCardAnimated from './VoteRankCardAnimated';

export type { VoteRankCardProps };

export function VoteRankCard({
  item,
  rank,
  className = '',
  showVoteChange = false,
  voteChange = 0,
  isAnimating = false,
  voteTotal,
  onVoteChange,
  enableMotionAnimations = true,
}: VoteRankCardProps) {
  // SSR / CSR first render 에서는 framer-motion 분기를 끈다. motion 컴포넌트는
  // mount 시점에 inline style (transform / boxShadow / spring 값) 을 계산해
  // SSR HTML 에 없는 attribute 를 추가하므로, 그 자체가 hydration mismatch 의
  // 알려진 원인 (PICNIC-WEB-5C 의 vote/[id] + Podium 케이스). mount 후에만 motion 활성.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const motionEnabled = enableMotionAnimations && mounted;
  const { currentLanguage, t } = useLanguageStore();
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: t('vote_login_required_title'),
      description: t('vote_login_required_description'),
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
      }, VOTE_CHANGE_ANIMATION_MS);

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
    ? getLocalizedString(item.artist.name, currentLanguage) || t('artist_name_fallback')
    : t('artist_name_fallback');

  // 아티스트 이미지 URL
  const imageSrc = item.artist?.image || null;

  // 투표수 결정 (voteTotal prop이 있으면 사용, 없으면 item.voteTotal 사용)
  const displayVoteTotal =
    voteTotal !== undefined ? voteTotal : item.vote_total || 0;

  // 실시간 정보 추출
  const realtimeInfo = item._realtimeInfo;
  const isHighlighted = realtimeInfo?.isHighlighted;
  const rankChange = realtimeInfo?.rankChange;
  const isNew = realtimeInfo?.isNew;
  const isUpdated = realtimeInfo?.isUpdated;

  const sizeClasses = getFullWidthSize(rank);

  // 애니메이션이 비활성화된 경우 기본 렌더링
  if (!motionEnabled) {
    return (
      <div
        className={`relative flex flex-col justify-center items-center ${
          sizeClasses.padding
        } rounded-xl backdrop-blur-sm transform transition-all duration-300 overflow-hidden min-w-0 ${
          isAnimating ? 'animate-pulse' : ''
        } ${getRankStyles(rank, isUpdated)} ${
          onVoteChange ? 'cursor-pointer hover:scale-105' : 'cursor-default'
        } ${className}`}
        onClick={handleCardClick}
      >
        {/* 기본 컨텐츠... */}
        <div
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
        </div>
        <div className='flex flex-col items-center mt-2 min-h-0 w-full overflow-hidden'>
          <h3
            className={`font-bold text-center ${sizeClasses.name} truncate w-full px-1 mb-1 text-gray-900`}
          >
            {artistName}
          </h3>
          {item.artist?.artistGroup?.name && (
            <p className='text-xs text-gray-600 text-center truncate w-full px-1 mb-1'>
              {getLocalizedString(
                item.artist.artistGroup.name,
                currentLanguage,
              )}
            </p>
          )}
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
              className={`font-bold ${
                isUpdated ? 'text-green-600' : 'text-blue-600'
              } ${sizeClasses.votes} truncate w-full px-1 text-center transition-all duration-300 ${
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
    <VoteRankCardAnimated
      item={item}
      rank={rank}
      sizeClasses={sizeClasses}
      artistName={artistName}
      imageSrc={imageSrc}
      displayVoteTotal={displayVoteTotal}
      currentVoteChange={currentVoteChange}
      shouldShowVoteChange={shouldShowVoteChange}
      isHighlighted={isHighlighted}
      rankChange={rankChange}
      isNew={isNew}
      isUpdated={isUpdated}
      isAnimating={isAnimating}
      onVoteChange={onVoteChange}
      handleCardClick={handleCardClick}
      className={className}
      currentLanguage={currentLanguage}
    />
  );
}
