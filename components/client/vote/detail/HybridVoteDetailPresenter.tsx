'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { Vote, VoteItem, Reward, UserVote } from '@/types/interfaces';
import type { User } from '@supabase/supabase-js';
import {
  getVoteStatus,
  VoteStatus,
  getRemainingTime,
} from '@/components/server/utils';
import { CountdownTimer } from '../common/CountdownTimer';
import { VoteRankCard } from '../common/VoteRankCard';
import { VoteSearch } from './VoteSearch';
import { Card } from '@/components/common/molecules';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString, hasValidLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { useNotification } from '@/contexts/NotificationContext';
import { useDebounce } from 'use-debounce';
import VotePopup from '../dialogs/VotePopup';
import { formatVotePeriodWithTimeZone } from '@/utils/date';

interface HybridVoteDetailPresenterProps {
  vote: Vote;
  initialItems: VoteItem[];
  rewards?: Reward[];
  user: User | null;
  userVotes: { vote_item_id: number; vote_count: number }[];
  className?: string;
  enableRealtime?: boolean;
  pollingInterval?: number;
  maxRetries?: number;
}

export function HybridVoteDetailPresenter({
  vote,
  initialItems,
  rewards = [],
  user,
  userVotes,
  className,
  enableRealtime = true,
  pollingInterval = 10000,
  maxRetries = 3,
}: HybridVoteDetailPresenterProps) {
  const { t, currentLanguage } = useLanguageStore();
  const { addNotification } = useNotification();
  const { withAuth, isLoading: isAuthLoading } = useRequireAuth({
    customLoginMessage: {
      title: t('vote_login_required_title'),
      description: t('vote_login_required_description'),
    },
  });

  const [voteItems, setVoteItems] = useState<VoteItem[]>(initialItems);
  const [voteStatus, setVoteStatus] = useState<VoteStatus>(() =>
    getVoteStatus(vote),
  );
  const [timeLeft, setTimeLeft] = useState<ReturnType<
    typeof getRemainingTime
  > | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voteCandidate, setVoteCandidate] = useState<VoteItem | null>(null);
  const [voteAmount, setVoteAmount] = useState(1);
  const headerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [searchHeight, setSearchHeight] = useState(0);

  const isVoteActionable = useMemo(() => voteStatus === 'ongoing', [voteStatus]);

  const formatVotePeriod = useCallback(() => {
    if (!vote.start_at || !vote.stop_at) return '';
    return formatVotePeriodWithTimeZone(
      vote.start_at,
      vote.stop_at,
      currentLanguage,
    );
  }, [vote.start_at, vote.stop_at, currentLanguage]);

  useEffect(() => {
    const timer = setInterval(() => {
      const newStatus = getVoteStatus(vote);
      if (newStatus !== voteStatus) {
        setVoteStatus(newStatus);
      }
      setTimeLeft(getRemainingTime(vote.stop_at));
    }, 1000);

    return () => clearInterval(timer);
  }, [vote, voteStatus]);

  const { rankedVoteItems, filteredItems } = useMemo(() => {
    const sortedByVotes = [...voteItems].sort(
      (a, b) => (b.vote_total || 0) - (a.vote_total || 0),
    );

    let currentRank = 1;
    const ranked = sortedByVotes.map((item, index) => {
      if (
        index > 0 &&
        (item.vote_total || 0) < (sortedByVotes[index - 1].vote_total || 0)
      ) {
        currentRank = index + 1;
      }
      return { ...item, rank: currentRank };
    });

    const filtered = debouncedSearchQuery
      ? ranked.filter(item => {
          const artistName = item.artist?.name
            ? getLocalizedString(item.artist.name, currentLanguage)?.toLowerCase() ||
              ''
            : '';
          const query = debouncedSearchQuery.toLowerCase();
          return artistName.includes(query);
        })
      : ranked;

    return { rankedVoteItems: ranked, filteredItems: filtered };
  }, [voteItems, debouncedSearchQuery, currentLanguage]);

  const { voteTitle, voteContent } = useMemo(
    () => ({
      voteTitle: getLocalizedString(vote.title, currentLanguage),
      voteContent: getLocalizedString(vote.vote_content, currentLanguage),
    }),
    [vote.title, vote.vote_content, currentLanguage],
  );

  const handleCardClick = async (item: VoteItem) => {
    if (!isVoteActionable) {
      addNotification({
        type: 'info',
        title: t('common_notice'),
        message: t('vote_not_available_on_web'),
      });
      return;
    }

    withAuth(async () => {
      setVoteCandidate(item);
      setVoteAmount(1);
      setShowVoteModal(true);
    });
  };

  const cancelVote = () => {
    setShowVoteModal(false);
    setVoteCandidate(null);
    setVoteAmount(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };
  
  const refetchVoteData = useCallback(async () => {
    try {
      const response = await fetch(`/api/votes/${vote.id}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to refetch vote data');
      }
      const data = await response.json();
      if (data && data.vote && data.vote.vote_item) {
        setVoteItems(data.vote.vote_item);
        // Optionally update other states like userVotes if needed
      }
    } catch (error) {
      console.error("Error refetching vote data:", error);
      addNotification({
        type: 'error',
        title: t('common_error'),
        message: t('vote_refetch_error'),
      });
    }
  }, [vote.id, addNotification, t]);
  
  useEffect(() => {
    const updateHeights = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
      if (searchRef.current) {
        setSearchHeight(searchRef.current.offsetHeight);
      }
    };
    updateHeights();
    window.addEventListener('resize', updateHeights);
    return () => window.removeEventListener('resize', updateHeights);
  }, []);

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 ${className}`}
    >
      <div
        ref={headerRef}
        className='sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-lg mb-2'
      >
        <div className='relative overflow-hidden'>
          <div className='absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-10'></div>
          <div className='border-0 bg-white/80 backdrop-blur-sm rounded-lg p-4'>
            <div className='pb-2'>
              <div className='flex items-start justify-between gap-2 mb-1'>
                <h1 className='text-base md:text-lg lg:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex-1 min-w-0'>
                  {voteTitle}
                </h1>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs rounded-full font-medium ${
                      voteStatus === 'ongoing'
                        ? 'bg-green-100 text-green-800'
                        : voteStatus === 'upcoming'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {voteStatus === 'ongoing' ? t('label_tabbar_vote_active') :
                     voteStatus === 'upcoming' ? t('label_tabbar_vote_upcoming') : t('label_tabbar_vote_end')}
                  </span>
                </div>
              </div>
              <div className='flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600 mb-2'>
                <span>📅 {formatVotePeriod()}</span>
              </div>
              <div className="flex items-center justify-between">
                <CountdownTimer
                  timeLeft={timeLeft}
                  voteStatus={voteStatus}
                  variant="decorated"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div 
        ref={searchRef}
        className='sticky z-20 bg-white/95 backdrop-blur-md border-b border-gray-200/50 py-3 shadow-sm'
        style={{ top: `${headerHeight}px` }}
      >
        <div className="px-4">
          <VoteSearch 
            onSearch={handleSearch}
            placeholder={t('text_vote_where_is_my_bias')}
            totalItems={rankedVoteItems.length}
            searchResults={filteredItems}
            disabled={!isVoteActionable}
          />
        </div>
      </div>
      
      {voteStatus !== 'upcoming' && rankedVoteItems.length >= 2 && (
        <div
          className='sticky z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 py-2 md:py-3 mb-2 md:mb-4 shadow-lg'
          style={{ top: `${headerHeight + searchHeight}px` }}
        >
          <div className='container mx-auto px-4'>
            <div className='text-center mb-2 md:mb-3'>
              <div className='flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4'>
                <h2 className='text-lg md:text-xl font-bold bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-500 bg-clip-text text-transparent'>
                  🏆 TOP 3
                </h2>
              </div>
            </div>
            {rankedVoteItems.length === 2 ? (
              <div className='flex justify-center items-end w-full max-w-xs sm:max-w-sm md:max-w-md gap-2 sm:gap-3 px-4 sm:px-6 mx-auto'>
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-110 hover:-translate-y-2 z-10 flex-1'>
                  <div className='relative w-full max-w-[100px] sm:max-w-[120px] md:max-w-[135px]'>
                    <div className='absolute -inset-1 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 rounded blur opacity-40 animate-pulse'></div>
                    <div className='relative bg-gradient-to-br from-yellow-100 to-orange-100 p-1.5 rounded border-2 border-yellow-400 shadow-xl'>
                      <div className='absolute -top-1 -right-1 text-sm animate-bounce'>
                        👑
                      </div>
                      <VoteRankCard
                        item={rankedVoteItems[0]}
                        rank={1}
                        className='w-full h-40 sm:h-44 md:h-48'
                        voteTotal={rankedVoteItems[0].vote_total || 0}
                        enableMotionAnimations={true}
                        mode="detail"
                        onAuthenticatedVote={() => handleCardClick(rankedVoteItems[0])}
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-base font-bold animate-pulse'>🥇</div>
                  </div>
                </div>
                <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1 flex-1'>
                  <div className='relative w-full max-w-[85px] sm:max-w-[100px] md:max-w-[110px]'>
                    <div className='absolute -inset-0.5 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                    <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                      <VoteRankCard
                        item={rankedVoteItems[1]}
                        rank={2}
                        className='w-full h-32 sm:h-36 md:h-40'
                        voteTotal={rankedVoteItems[1].vote_total || 0}
                        enableMotionAnimations={true}
                        mode="detail"
                        onAuthenticatedVote={() => handleCardClick(rankedVoteItems[1])}
                      />
                    </div>
                  </div>
                  <div className='mt-1 text-center'>
                    <div className='text-sm'>🥈</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className='flex justify-center items-end w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg gap-1 sm:gap-2 md:gap-3 px-2 sm:px-4 mx-auto'>
                {rankedVoteItems[1] && (
                  <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                    <div className='relative'>
                      <div className='absolute -inset-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded blur opacity-30'></div>
                      <div className='relative bg-gradient-to-br from-gray-100 to-gray-200 p-1 rounded border border-gray-300 shadow-lg'>
                        <VoteRankCard
                          item={rankedVoteItems[1]}
                          rank={2}
                          className='w-20 sm:w-24 md:w-28 lg:w-32'
                          voteTotal={rankedVoteItems[1].vote_total || 0}
                          enableMotionAnimations={true}
                          mode="detail"
                          onAuthenticatedVote={() => handleCardClick(rankedVoteItems[1])}
                        />
                      </div>
                    </div>
                    <div className='mt-1 text-center'>
                      <div className='text-sm'>🥈</div>
                    </div>
                  </div>
                )}
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
                          voteTotal={rankedVoteItems[0].vote_total || 0}
                          enableMotionAnimations={true}
                          mode="detail"
                          onAuthenticatedVote={() => handleCardClick(rankedVoteItems[0])}
                        />
                      </div>
                    </div>
                    <div className='mt-1 text-center'>
                      <div className='text-base font-bold animate-pulse'>🥇</div>
                    </div>
                  </div>
                )}
                {rankedVoteItems[2] && (
                  <div className='flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-1'>
                    <div className='relative'>
                      <div className='absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded blur opacity-30'></div>
                      <div className='relative bg-gradient-to-br from-amber-100 to-orange-100 p-1 rounded border border-amber-400 shadow-lg'>
                        <VoteRankCard
                          item={rankedVoteItems[2]}
                          rank={3}
                          className='w-18 sm:w-20 md:w-24 lg:w-28'
                          voteTotal={rankedVoteItems[2].vote_total || 0}
                          enableMotionAnimations={true}
                          mode="detail"
                          onAuthenticatedVote={() => handleCardClick(rankedVoteItems[2])}
                        />
                      </div>
                    </div>
                    <div className='mt-1 text-center'>
                      <div className='text-sm'>🥉</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                onClick={() => handleCardClick(item)}
              >
                <Card
                  hoverable={isVoteActionable}
                  className={`
                    group relative overflow-hidden border-0 shadow-lg hover:shadow-2xl 
                    transition-all duration-300 cursor-pointer
                    ${
                      !isVoteActionable
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
                  {isVoteActionable ? (
                    <div className='absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                      <div className='bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-1.5 py-0.5 rounded-full shadow-lg'>
                        투표
                      </div>
                    </div>
                  ) : null}

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
                          <div className='absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
                        </div>
                      </div>
                      <h3 className='font-bold text-xs mb-0.5 line-clamp-1 text-gray-800 group-hover:text-blue-600 transition-colors'>
                        {artistName}
                      </h3>
                      {item.artist?.artistGroup?.name && hasValidLocalizedString(item.artist.artistGroup.name) && (
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
                              {t('text_vote_rank', { rank: item.rank.toString() })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card.Body>
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
              {t('common_text_no_search_result')}
            </p>
            <p className='text-sm text-gray-400 mt-2'>
              {t('search_try_other_keywords')}
            </p>
          </div>
        )}
      </div>
      <VotePopup
        isOpen={showVoteModal}
        onClose={cancelVote}
        voteId={vote.id}
        voteItemId={voteCandidate?.id || 0}
        artistName={voteCandidate?.artist?.name 
          ? getLocalizedString(voteCandidate.artist.name, currentLanguage) 
          : '아티스트'
        }
        onVoteSuccess={async (amount) => {
          await refetchVoteData();
          setShowVoteModal(false);
          setVoteCandidate(null);
          setVoteAmount(1);
          
          addNotification({
            type: 'success',
            title: t('vote_popup_vote_success'),
            message: `${getLocalizedString(voteCandidate?.artist?.name || '', currentLanguage)}에게 ${amount} 투표했습니다.`,
          });
        }}
      />
      {rewards.length > 0 && (
        <section className="px-4 pb-8">
          <h2 className="text-xl font-semibold mb-4">🎁 투표 리워드</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rewards.map((reward, index) => (
              <div key={reward.id || index} className="border rounded-lg p-4">
                <p>리워드 #{index + 1}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
} 