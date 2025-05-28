'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import {
  getVoteStatus,
  formatRemainingTime,
  formatTimeUntilStart,
} from '@/components/server/utils';
import { VoteCard, VoteRankCard } from '..';
import { VoteTimer } from '../common/VoteTimer';
import { VoteSearch } from './VoteSearch';
import { VoteButton } from '../common/VoteButton';
import { Badge, Card } from '@/components/common';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useRequireAuth } from '@/hooks/useAuthGuard';

export interface VoteDetailPresenterProps {
  vote: Vote;
  initialItems: VoteItem[];
  rewards?: any[]; // TODO: Reward 타입 정의
  className?: string;
}

export function VoteDetailPresenter({
  vote,
  initialItems,
  rewards = [],
  className,
}: VoteDetailPresenterProps) {
  const { currentLanguage } = useLanguageStore();
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });
  const [voteItems, setVoteItems] = useState<VoteItem[]>(initialItems);
  const [selectedItem, setSelectedItem] = useState<VoteItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voteCandidate, setVoteCandidate] = useState<VoteItem | null>(null);
  const [voteAmount, setVoteAmount] = useState(1);
  const [availableVotes, setAvailableVotes] = useState(10); // TODO: 실제 사용자 투표 가능량으로 변경
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';

  // 남은 시간 계산 및 업데이트
  useEffect(() => {
    if (!vote.stop_at || voteStatus !== 'ongoing') return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const endTime = new Date(vote.stop_at!).getTime();
      const difference = endTime - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor(
          (difference % (1000 * 60 * 60)) / (1000 * 60),
        );
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [vote.stop_at, voteStatus]);

  // 투표 기간 포맷팅
  const formatVotePeriod = () => {
    if (!vote.start_at || !vote.stop_at) return '';

    const startDate = new Date(vote.start_at);
    const endDate = new Date(vote.stop_at);

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
  };

  // 타이머 렌더링
  const renderTimer = () => {
    if (voteStatus !== 'ongoing' || !timeLeft) return null;

    const { days, hours, minutes, seconds } = timeLeft;
    const isExpired =
      days === 0 && hours === 0 && minutes === 0 && seconds === 0;

    if (isExpired) {
      return (
        <div className='flex items-center gap-2'>
          <span className='text-xl'>🚫</span>
          <span className='text-sm md:text-base font-bold text-red-600'>
            마감
          </span>
        </div>
      );
    }

    return (
      <div className='flex items-center gap-2'>
        <span className='text-xl'>⏱️</span>
        <div className='flex items-center gap-1 text-xs sm:text-sm font-mono font-bold'>
          {days > 0 && (
            <>
              <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>
                {days}일
              </span>
              <span className='text-gray-400'>:</span>
            </>
          )}
          <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>
            {hours.toString().padStart(2, '0')}시
          </span>
          <span className='text-gray-400'>:</span>
          <span className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'>
            {minutes.toString().padStart(2, '0')}분
          </span>
          <span className='text-gray-400'>:</span>
          <span className='bg-red-100 text-red-800 px-1.5 py-0.5 rounded animate-pulse text-xs'>
            {seconds.toString().padStart(2, '0')}초
          </span>
        </div>
      </div>
    );
  };

  // 투표 아이템 랭킹 계산
  const rankedVoteItems = useMemo(() => {
    if (!voteItems.length) return [];

    const sortedItems = [...voteItems].sort(
      (a, b) => (b.vote_total || 0) - (a.vote_total || 0),
    );

    let currentRank = 1;
    let currentScore = sortedItems[0]?.vote_total || 0;

    return sortedItems.map((item, index) => {
      if (index > 0 && currentScore !== (item.vote_total || 0)) {
        currentRank = index + 1;
        currentScore = item.vote_total || 0;
      }

      return {
        ...item,
        rank: currentRank,
      };
    });
  }, [voteItems]);

  // 검색 필터링
  const filteredItems = useMemo(() => {
    if (!searchQuery) return rankedVoteItems;

    return rankedVoteItems.filter((item) => {
      const artistName = item.artist?.name
        ? getLocalizedString(
            item.artist.name,
            currentLanguage,
          )?.toLowerCase() || ''
        : '';
      const query = searchQuery.toLowerCase();
      return artistName.includes(query);
    });
  }, [rankedVoteItems, searchQuery, currentLanguage]);

  // 투표 확인 팝업 열기
  const handleCardClick = async (item: VoteItem) => {
    console.log('🎯 handleCardClick 시작:', {
      canVote,
      itemId: item.id,
      artistId: item.artist_id,
      groupId: item.group_id,
      timestamp: new Date().toISOString(),
    });

    if (!canVote) {
      console.log('❌ canVote가 false - 투표 불가능');
      return;
    }

    console.log('🔐 withAuth 호출 시작...');

    // 인증이 필요한 투표 액션을 실행
    const result = await withAuth(async () => {
      console.log('✅ withAuth 내부 - 인증 성공, 투표 다이얼로그 표시');
      // 인증된 사용자만 여기에 도달
      setVoteCandidate(item);
      setVoteAmount(1); // 투표량 초기화
      setShowVoteModal(true);
      return true;
    });

    console.log('🔍 withAuth 결과:', result);

    // withAuth가 null을 반환하면 인증 실패 (로그인 다이얼로그 표시됨)
    // 인증 성공 시에만 result가 true가 됨
    if (!result) {
      console.log('❌ 인증 실패 - 투표 다이얼로그 표시하지 않음');
    } else {
      console.log('✅ 인증 성공 - 투표 다이얼로그가 표시되어야 함');
    }
  };

  // 투표 확인
  const confirmVote = async () => {
    if (!voteCandidate || voteAmount <= 0 || voteAmount > availableVotes)
      return;

    // 인증이 필요한 투표 액션을 실행
    const result = await withAuth(async () => {
      setIsVoting(true);
      setShowVoteModal(false);
      try {
        // TODO: 실제 투표 API 호출
        console.log('Voting for:', {
          voteId: vote.id,
          itemId: voteCandidate.id,
          amount: voteAmount,
        });

        // 임시로 투표수 증가
        setVoteItems((prev) =>
          prev.map((item) =>
            item.id === voteCandidate.id
              ? { ...item, vote_total: (item.vote_total || 0) + voteAmount }
              : item,
          ),
        );

        // 사용 가능한 투표량 감소
        setAvailableVotes((prev) => prev - voteAmount);
      } catch (error) {
        console.error('Vote error:', error);
      } finally {
        setIsVoting(false);
        setVoteCandidate(null);
        setVoteAmount(1);
      }
      return true;
    });

    // 인증 실패 시 투표 다이얼로그 유지
    if (!result) {
      console.log('투표 인증 실패 - 다이얼로그 유지');
      // 투표 다이얼로그는 열린 상태로 유지
    }
  };

  // 투표 취소
  const cancelVote = () => {
    setShowVoteModal(false);
    setVoteCandidate(null);
  };

  // 투표 제목 가져오기
  const voteTitle = vote.title
    ? getLocalizedString(vote.title, currentLanguage) || '투표'
    : '투표';

  // 투표 내용 가져오기
  const voteContent = vote.vote_content || '';

  // 헤더 높이 측정
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    updateHeaderHeight();

    // 리사이즈와 레이아웃 변경 감지
    window.addEventListener('resize', updateHeaderHeight);

    // MutationObserver로 헤더 내용 변경 감지
    const observer = new MutationObserver(updateHeaderHeight);
    if (headerRef.current) {
      observer.observe(headerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    // 약간의 지연 후 한 번 더 측정 (레이아웃 안정화 후)
    const timer = setTimeout(updateHeaderHeight, 100);

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [voteTitle, voteContent, voteStatus, availableVotes]); // 의존성 추가

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 ${className}`}
    >
      {/* 헤더 정보 */}
      <div
        ref={headerRef}
        className='sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-lg mb-2'
      >
        <div className='relative overflow-hidden'>
          <div className='absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-10'></div>
          <Card className='border-0 bg-white/80 backdrop-blur-sm'>
            <Card.Header className='pb-2'>
              <div className='flex items-start justify-between gap-2 mb-1'>
                <h1 className='text-base md:text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex-1 min-w-0'>
                  {voteTitle}
                </h1>
                <Badge
                  variant={
                    voteStatus === 'ongoing'
                      ? 'success'
                      : voteStatus === 'upcoming'
                      ? 'info'
                      : 'default'
                  }
                  className='text-xs px-2 py-1 font-semibold shadow-lg flex-shrink-0'
                >
                  {voteStatus === 'ongoing' && '🔥 진행중'}
                  {voteStatus === 'upcoming' && '⏰ 예정'}
                  {voteStatus === 'completed' && '✅ 종료'}
                </Badge>
              </div>
              {voteContent && (
                <p className='text-gray-600 text-xs md:text-sm leading-relaxed'>
                  {voteContent}
                </p>
              )}
            </Card.Header>
            <Card.Footer className='pt-1 border-t border-gray-100'>
              <div className='flex flex-col gap-1'>
                {/* 투표 기간과 보유 투표권을 한 줄로 */}
                <div className='flex items-center justify-between text-xs'>
                  <div className='flex items-center gap-1'>
                    <span className='text-sm'>📅</span>
                    <span className='text-gray-500'>투표기간</span>
                  </div>
                  <div className='flex items-center gap-1'>
                    <span className='text-sm'>🗳️</span>
                    <span className='text-gray-500'>보유</span>
                    <span className='font-bold text-blue-600'>
                      {availableVotes}표
                    </span>
                  </div>
                </div>
                {/* 투표 기간 정보 */}
                <div className='text-xs text-gray-700 leading-tight'>
                  {formatVotePeriod()}
                </div>
              </div>
            </Card.Footer>
          </Card>
        </div>
      </div>

      {/* 상위 3위 표시 */}
      {voteStatus !== 'upcoming' && rankedVoteItems.length > 0 && (
        <div
          className='sticky z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 py-2 md:py-3 mb-2 md:mb-4 shadow-lg'
          style={{ top: `${headerHeight}px` }}
        >
          <div className='container mx-auto px-4'>
            <div className='text-center mb-2 md:mb-3'>
              <div className='flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4'>
                <h2 className='text-lg md:text-xl font-bold bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-500 bg-clip-text text-transparent'>
                  🏆 TOP 3
                </h2>

                {/* 타이머 */}
                <div className='flex items-center gap-3'>{renderTimer()}</div>
              </div>
            </div>

            {/* 포디움 스타일 레이아웃 - 더 컴팩트 */}
            <div className='flex justify-center items-end w-full max-w-4xl gap-1 sm:gap-2 md:gap-4 px-2 sm:px-4 mx-auto'>
              {/* 2위 */}
              {rankedVoteItems[1] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                      <VoteRankCard
                        item={rankedVoteItems[1]}
                        rank={2}
                        className='w-20 sm:w-24 md:w-28 lg:w-32'
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-sm'>🥈</div>
                  </div>
                </div>
              )}

              {/* 1위 */}
              {rankedVoteItems[0] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10'>
                  <div className='relative'>
                    <div className='absolute -inset-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                    <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                      <div className='absolute -top-0.5 -right-0.5 text-sm animate-bounce'>
                        👑
                      </div>
                      <VoteRankCard
                        item={rankedVoteItems[0]}
                        rank={1}
                        className='w-24 sm:w-32 md:w-36 lg:w-40'
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-base font-bold animate-pulse'>🥇</div>
                  </div>
                </div>
              )}

              {/* 3위 */}
              {rankedVoteItems[2] && (
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                  <div className='relative'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                      <VoteRankCard
                        item={rankedVoteItems[2]}
                        rank={3}
                        className='w-18 sm:w-20 md:w-24 lg:w-28'
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-sm'>🥉</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 검색 바 */}
      <div className='mb-2 md:mb-4 px-4 sm:px-0'>
        <div className='transform transition-all duration-300 hover:scale-[1.02]'>
          <VoteSearch
            onSearch={setSearchQuery}
            searchResults={filteredItems}
            totalItems={rankedVoteItems.length}
            disabled={!canVote}
          />
        </div>
      </div>

      {/* 투표 아이템 그리드 - 개선된 반응형 */}
      <div className='container mx-auto px-4 pb-8'>
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-3 md:gap-4'>
          {filteredItems.map((item, index) => {
            const artistName = item.artist?.name
              ? getLocalizedString(item.artist.name, currentLanguage) ||
                '아티스트'
              : '아티스트';
            const imageUrl = item.artist?.image
              ? getCdnImageUrl(item.artist.image)
              : '/images/default-artist.png';

            return (
              <div
                key={item.id}
                className='transform transition-all duration-300 hover:scale-105 hover:-translate-y-2'
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
                onClick={() => {
                  console.log('🖱️ [VoteDetailPresenter] 카드 클릭됨:', {
                    canVote,
                    itemId: item.id,
                    artistName: artistName,
                    timestamp: new Date().toISOString(),
                  });

                  if (canVote) {
                    handleCardClick(item);
                  } else {
                    console.log('❌ canVote가 false - 클릭 무시됨');
                  }
                }}
              >
                <Card
                  hoverable={canVote}
                  className={`
                    group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl 
                    transition-all duration-300 cursor-pointer
                    ${
                      !canVote
                        ? 'opacity-75 grayscale cursor-not-allowed'
                        : 'hover:shadow-blue-200/50 hover:shadow-xl'
                    }
                    ${
                      item.rank <= 3
                        ? 'ring-2 ring-yellow-400/50 bg-gradient-to-br from-yellow-50/50 to-orange-50/50'
                        : 'bg-gradient-to-br from-white to-blue-50/30'
                    }
                    backdrop-blur-sm
                  `}
                >
                  {/* 순위 배지 */}
                  {item.rank && item.rank <= 10 && (
                    <div
                      className={`
                      absolute top-1 left-1 z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-full 
                      flex items-center justify-center text-xs font-bold text-white shadow-lg
                      ${
                        item.rank === 1
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 animate-pulse'
                          : item.rank === 2
                          ? 'bg-gradient-to-br from-gray-400 to-gray-600'
                          : item.rank === 3
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                          : 'bg-gradient-to-br from-blue-500 to-purple-600'
                      }
                    `}
                    >
                      {item.rank}
                    </div>
                  )}

                  {/* 투표 가능 상태 표시 */}
                  {canVote && (
                    <div className='absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                      <div className='bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full shadow-lg'>
                        투표
                      </div>
                    </div>
                  )}

                  {/* 투표 중 오버레이 */}
                  {isVoting && voteCandidate?.id === item.id && (
                    <div className='absolute inset-0 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center z-20'>
                      <div className='bg-white rounded-full p-2 shadow-xl'>
                        <div className='w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin'></div>
                      </div>
                    </div>
                  )}

                  <Card.Body className='p-1.5'>
                    <div className='text-center'>
                      <div className='relative mb-1.5 group'>
                        <div className='relative w-full aspect-square bg-gray-100 rounded overflow-hidden'>
                          <img
                            src={imageUrl}
                            alt={artistName}
                            className='w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:brightness-110'
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = '/images/default-artist.png';
                              target.onerror = null;
                            }}
                          />
                          {/* 이미지 오버레이 효과 */}
                          <div className='absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
                        </div>
                      </div>

                      <h3 className='font-bold text-xs mb-0.5 line-clamp-1 group-hover:text-blue-600 transition-colors'>
                        {artistName}
                      </h3>

                      {item.artist?.artistGroup?.name && (
                        <p className='text-xs text-gray-500 mb-0.5 line-clamp-1 group-hover:text-gray-700 transition-colors'>
                          {getLocalizedString(
                            item.artist.artistGroup.name,
                            currentLanguage,
                          )}
                        </p>
                      )}

                      <div className='space-y-0.5'>
                        <p className='text-xs sm:text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent'>
                          {(item.vote_total || 0).toLocaleString()}
                          <span className='text-xs text-gray-500 ml-0.5'>
                            표
                          </span>
                        </p>

                        {item.rank && (
                          <div className='flex items-center justify-center gap-0.5'>
                            {item.rank <= 3 && (
                              <span className='text-xs'>
                                {item.rank === 1
                                  ? '🥇'
                                  : item.rank === 2
                                  ? '🥈'
                                  : '🥉'}
                              </span>
                            )}
                            <span className='text-xs text-gray-500 font-medium'>
                              {item.rank}위
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card.Body>

                  {/* 하단 그라데이션 장식 */}
                  <div
                    className={`
                    absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300
                    ${
                      item.rank <= 3
                        ? 'from-yellow-400 via-orange-500 to-red-500'
                        : 'from-blue-500 via-purple-500 to-pink-500'
                    }
                  `}
                  ></div>
                </Card>
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className='text-center py-16'>
            <div className='text-6xl mb-4'>🔍</div>
            <p className='text-xl text-gray-500 font-medium'>
              검색 결과가 없습니다.
            </p>
            <p className='text-sm text-gray-400 mt-2'>
              다른 검색어를 시도해보세요.
            </p>
          </div>
        )}
      </div>

      {/* 투표 확인 팝업 */}
      {showVoteModal && voteCandidate && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl transform animate-in zoom-in-95 duration-200'>
            {/* 후보자 정보 */}
            <div className='text-center mb-6'>
              <div className='w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden ring-4 ring-blue-100'>
                <img
                  src={
                    voteCandidate.artist?.image
                      ? getCdnImageUrl(voteCandidate.artist.image)
                      : '/images/default-artist.png'
                  }
                  alt={
                    voteCandidate.artist?.name
                      ? getLocalizedString(
                          voteCandidate.artist.name,
                          currentLanguage,
                        )
                      : '아티스트'
                  }
                  className='w-full h-full object-cover'
                />
              </div>
              <h3 className='text-lg font-bold text-gray-800 mb-1'>
                {voteCandidate.artist?.name
                  ? getLocalizedString(
                      voteCandidate.artist.name,
                      currentLanguage,
                    )
                  : '아티스트'}
              </h3>
              {voteCandidate.artist?.artistGroup?.name && (
                <p className='text-sm text-gray-500'>
                  {getLocalizedString(
                    voteCandidate.artist.artistGroup.name,
                    currentLanguage,
                  )}
                </p>
              )}
              {(() => {
                const rankedItem = rankedVoteItems.find(
                  (item) => item.id === voteCandidate.id,
                );
                return (
                  rankedItem?.rank && (
                    <div className='mt-2 flex items-center justify-center gap-1'>
                      {rankedItem.rank <= 3 && (
                        <span className='text-lg'>
                          {rankedItem.rank === 1
                            ? '🥇'
                            : rankedItem.rank === 2
                            ? '🥈'
                            : '🥉'}
                        </span>
                      )}
                      <span className='text-sm font-semibold text-gray-600'>
                        현재 {rankedItem.rank}위
                      </span>
                    </div>
                  )
                );
              })()}
            </div>

            {/* 확인 메시지 */}
            <div className='text-center mb-6'>
              <h2 className='text-xl font-bold text-gray-800 mb-2'>
                투표 확인
              </h2>
              <p className='text-gray-600'>이 후보에게 투표하시겠습니까?</p>
              <p className='text-sm text-gray-500 mt-1'>
                투표는 한 번만 가능합니다.
              </p>
            </div>

            {/* 투표량 선택 */}
            <div className='mb-6'>
              <div className='flex items-center justify-between mb-3'>
                <label className='text-sm font-semibold text-gray-700'>
                  투표량
                </label>
                <span className='text-xs text-gray-500'>
                  보유: {availableVotes}표
                </span>
              </div>

              <div className='flex items-center gap-3'>
                <button
                  onClick={() => setVoteAmount(Math.max(1, voteAmount - 1))}
                  disabled={voteAmount <= 1}
                  className='w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-600 transition-colors'
                >
                  −
                </button>

                <div className='flex-1 text-center'>
                  <input
                    type='number'
                    min='1'
                    max={availableVotes}
                    value={voteAmount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setVoteAmount(
                        Math.min(availableVotes, Math.max(1, value)),
                      );
                    }}
                    className='w-full text-center text-lg font-bold border-2 border-gray-200 rounded-lg py-2 focus:border-blue-500 focus:outline-none'
                  />
                  <div className='text-xs text-gray-500 mt-1'>표</div>
                </div>

                <button
                  onClick={() =>
                    setVoteAmount(Math.min(availableVotes, voteAmount + 1))
                  }
                  disabled={voteAmount >= availableVotes}
                  className='w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-600 transition-colors'
                >
                  +
                </button>
              </div>

              {/* 빠른 선택 버튼 */}
              <div className='flex gap-2 mt-3'>
                {[1, 5, Math.min(10, availableVotes), availableVotes]
                  .filter(
                    (val, idx, arr) => arr.indexOf(val) === idx && val > 0,
                  )
                  .map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setVoteAmount(amount)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        voteAmount === amount
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      {amount}표
                    </button>
                  ))}
              </div>
            </div>

            {/* 버튼 */}
            <div className='flex gap-3'>
              <button
                onClick={cancelVote}
                className='flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors duration-200'
              >
                취소
              </button>
              <button
                onClick={confirmVote}
                disabled={
                  isVoting || voteAmount <= 0 || voteAmount > availableVotes
                }
                className='flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isVoting ? (
                  <div className='flex items-center justify-center gap-2'>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
                    투표 중...
                  </div>
                ) : (
                  `${voteAmount}표 투표하기`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
