'use client';

import { useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { getCdnImageUrl } from '@/utils/api/image';
import { hasValidLocalizedString } from '@/utils/api/strings';
import { useLanguage } from '@/hooks/useLanguage';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, InitialLoadingState, EmptyState, InfiniteScrollTrigger } from '@/components/mypage/MypageStates';
import type { StatisticCard, MypageHeaderConfig, EmptyStateConfig } from '@/types/mypage-common';

// 다국어 객체 타입 정의
type MultiLanguageText = {
  en: string;
  ko: string;
} | string;

interface VoteHistoryItem {
  id: string;
  voteId: number;
  voteItemId: number;
  amount: number;
  createdAt: string;
  vote: {
    id: number;
    title: MultiLanguageText;
    startAt: string;
    stopAt: string;
    mainImage: string | null;
    area: string;
    voteCategory: MultiLanguageText;
  } | null;
  voteItem: {
    id: number;
    artistId: number;
    groupId: number;
    artist: {
      id: number;
      name: MultiLanguageText;
      image: string | null;
      artistGroup: {
        id: number;
        name: MultiLanguageText;
      } | null;
    } | null;
  } | null;
}

interface Translations extends Record<string, string> {
  label_mypage_my_votes: string;
  label_loading: string;
  label_no_votes: string;
  label_load_more: string;
  label_vote_amount: string;
  label_vote_date: string;
  label_vote_category: string;
  label_artist_name: string;
  label_group_name: string;
  label_vote_title: string;
  label_error_occurred: string;
  label_retry: string;
  label_no_more_votes: string;
  label_star_candy: string;
  label_back_to_mypage: string;
  label_total_vote_count: string;
  label_vote_status_ongoing: string;
  label_vote_status_ended: string;
  label_vote_status_upcoming: string;
  label_no_title: string;
  label_unknown: string;
  label_group_separator: string;
  label_artist: string;
  label_scroll_for_more: string;
  label_all_votes_checked: string;
  label_total_votes_count: string;
  label_total_star_candy_used: string;
  label_supported_artists: string;
  label_please_try_again: string;
  label_loading_vote_history: string;
  label_no_vote_history_yet: string;
  label_vote_for_favorite_artist: string;
  label_go_to_vote: string;
  label_all_vote_history_checked: string;
  label_all_data_loaded: string;
  page_title_my_vote_history: string;
  label_total_votes: string;
  label_votes_description: string;
  label_total_amount: string;
  label_amount_description: string;
  label_votes_this_month: string;
  label_month_description: string;
  label_voted_item: string;
  label_vote_type: string;
  label_general_vote: string;
  label_total_votes_for_item: string;
}

interface VoteHistoryClientProps {
  initialUser: User;
  translations: Translations;
}

export default function VoteHistoryClient({ initialUser, translations }: VoteHistoryClientProps) {
  const { 
    formatRelativeDate,  // 상대적 날짜 표시
    formatDate,
    getLocalizedText 
  } = useLanguage();
  const t = (key: keyof Translations): string => translations[key] || (key as string);

  // 데이터 변환 함수
  const transformVoteItem = useCallback((item: any): VoteHistoryItem => {
    return {
      ...item,
      vote: item.vote ? {
        ...item.vote,
        title: typeof item.vote.title === 'object' 
          ? item.vote.title 
          : (item.vote.title || '제목 없음'),
        voteCategory: typeof item.vote.voteCategory === 'object' 
          ? item.vote.voteCategory 
          : (item.vote.voteCategory || '')
      } : null,
      voteItem: item.voteItem ? {
        ...item.voteItem,
        artist: item.voteItem.artist ? {
          ...item.voteItem.artist,
          name: typeof item.voteItem.artist.name === 'object'
            ? item.voteItem.artist.name
            : (item.voteItem.artist.name || '알 수 없음'),
          artistGroup: item.voteItem.artist.artistGroup && hasValidLocalizedString(item.voteItem.artist.artistGroup.name) ? {
            ...item.voteItem.artist.artistGroup,
            name: typeof item.voteItem.artist.artistGroup.name === 'object'
              ? item.voteItem.artist.artistGroup.name
              : (item.voteItem.artist.artistGroup.name || '')
          } : null
        } : null
      } : null
    };
  }, []);

  // 무한 스크롤 훅 사용
  const {
    items: voteHistory,
    statistics,
    isLoading,
    isLoadingMore,
    isInitialLoad,
    hasMore,
    error,
    totalCount,
    sentinelRef,
    retry,
    isEmpty,
    isLastPage
  } = useInfiniteScroll<VoteHistoryItem>({
    apiEndpoint: '/api/user/vote-history',
    limit: 10,
    transform: transformVoteItem,
    onSuccess: (data) => {
      console.log('📡 API 응답 데이터:', data);
    },
    onError: (error) => {
      console.error('투표 내역 조회 에러:', error);
    }
  });

  const getVoteStatus = (startAt: string, stopAt: string) => {
    const now = new Date();
    const start = new Date(startAt);
    const stop = new Date(stopAt);

    if (now < start) return { status: 'upcoming', color: 'text-blue-600 bg-blue-100' };
    if (now >= start && now <= stop) return { status: 'ongoing', color: 'text-green-600 bg-green-100' };
    return { status: 'ended', color: 'text-gray-600 bg-gray-100' };
  };

  // 안전한 이미지 에러 핸들러
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = '/images/default-artist.png';
    target.onerror = null;
  }, []);

  // 헤더 설정
  const headerConfig: MypageHeaderConfig = {
    title: t('label_mypage_my_votes'),
    icon: '🗳️',
    backUrl: '/mypage',
    backLabel: t('label_back_to_mypage')
  };

  // 통계 카드 설정
  const statisticsCards: StatisticCard[] = [
    {
      id: 'primary',
      title: t('label_total_votes_count'),
      value: totalCount,
      icon: '📊',
      bgColor: 'from-primary-50 to-primary-100',
      borderColor: 'border-primary-200/50',
      textColor: 'text-primary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'secondary',
      title: t('label_total_star_candy_used'),
      value: statistics?.totalStarCandyUsed || 0,
      icon: '⭐',
      bgColor: 'from-secondary-50 to-secondary-100',
      borderColor: 'border-secondary-200/50',
      textColor: 'text-secondary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'point',
      title: t('label_supported_artists'),
      value: statistics?.totalSupportedArtists || 0,
      icon: '👥',
      bgColor: 'from-point-50 to-point-100',
      borderColor: 'border-point-200/50',
      textColor: 'text-point-800',
      isLoading: isLoading || isInitialLoad
    }
  ];

  // 빈 상태 설정
  const emptyStateConfig: EmptyStateConfig = {
    title: t('label_no_vote_history_yet'),
    description: t('label_vote_for_favorite_artist'),
    actionLabel: t('label_go_to_vote'),
    actionUrl: '/vote',
    icon: '🗳️'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 헤더 */}
        <MypageHeader 
          config={{
            title: t('page_title_my_vote_history'),
            icon: '🗳️',
            backUrl: '/mypage',
            backLabel: t('label_back_to_mypage')
          }}
          statistics={[
            {
              id: 'primary',
              title: t('label_total_votes'),
              value: totalCount || 0,
              description: t('label_votes_description'),
              icon: '🗳️',
              bgColor: 'from-primary-50 to-primary-100',
              borderColor: 'border-primary-200/50',
              textColor: 'text-primary-800',
              isLoading: isLoading || isInitialLoad
            },
            {
              id: 'secondary',
              title: t('label_total_amount'),
              value: statistics?.totalAmount || 0,
              description: t('label_amount_description'),
              icon: '💰',
              bgColor: 'from-secondary-50 to-secondary-100',
              borderColor: 'border-secondary-200/50',
              textColor: 'text-secondary-800',
              isLoading: isLoading || isInitialLoad
            },
            {
              id: 'point',
              title: t('label_votes_this_month'),
              value: statistics?.thisMonth || 0,
              description: t('label_month_description'),
              icon: '📊',
              bgColor: 'from-point-50 to-point-100',
              borderColor: 'border-point-200/50',
              textColor: 'text-point-800',
              isLoading: isLoading || isInitialLoad
            }
          ]}
          translations={translations}
        />

        {/* 메인 콘텐츠 */}
        <div className="space-y-6">
          {/* 로딩 상태 */}
          {isInitialLoad && (
            <InitialLoadingState translations={translations} />
          )}

          {/* 에러 상태 */}
          {error && !isInitialLoad && (
            <ErrorState 
              error={error}
              onRetry={retry}
              translations={translations}
            />
          )}

          {/* 빈 상태 */}
          {isEmpty && !isInitialLoad && (
            <EmptyState 
              config={{
                title: t('label_no_vote_history'),
                description: t('label_no_vote_history_description'),
                actionLabel: t('label_go_to_vote'),
                actionUrl: '/vote',
                icon: '🗳️'
              }}
              translations={translations}
            />
          )}

          {/* 투표 내역 목록 */}
          {voteHistory.length > 0 && (
            <div className="space-y-6">
              {voteHistory.map((vote, index) => {
                return (
                  <div key={`${vote.id}-${index}`} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group">
                    <div className="p-6">
                      <div className="space-y-4">
                        {/* 투표 제목 */}
                        <div className="mb-3">
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200/50">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">🗳️</span>
                              </div>
                              <span className="font-bold text-blue-800 text-sm">{t('label_vote_title')}</span>
                            </div>
                                                         <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors duration-200">
                               {getLocalizedText(vote.vote?.title) || t('label_no_title')}
                             </h3>
                          </div>
                        </div>

                        {/* 투표한 선택지 */}
                        <div className="mb-3">
                          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 border border-green-200/50">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">✅</span>
                              </div>
                              <span className="font-bold text-green-800 text-sm">{t('label_voted_item')}</span>
                            </div>
                                                         <div className="text-gray-700 text-sm leading-relaxed">
                               {getLocalizedText(vote.voteItem?.artist?.name) || t('label_unknown')}
                             </div>
                          </div>
                        </div>

                        {/* 투표 통계 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* 투표 수량 */}
                          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-3 border border-yellow-200/50">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">🎯</span>
                              </div>
                              <span className="font-bold text-yellow-800 text-sm">{t('label_vote_amount')}</span>
                            </div>
                            <span className="text-gray-900 font-semibold text-sm">{vote.amount?.toLocaleString()}</span>
                          </div>

                          {/* 투표 타입 */}
                          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-3 border border-purple-200/50">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-violet-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">🏷️</span>
                              </div>
                              <span className="font-bold text-purple-800 text-sm">{t('label_vote_type')}</span>
                            </div>
                                                         <span className="text-gray-900 font-semibold text-sm">
                               {getLocalizedText(vote.vote?.voteCategory) || t('label_general_vote')}
                             </span>
                          </div>

                          {/* 누적 투표수 */}
                          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-3 border border-teal-200/50">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">📊</span>
                              </div>
                              <span className="font-bold text-teal-800 text-sm">{t('label_total_votes_for_item')}</span>
                            </div>
                                                         <span className="text-gray-900 font-semibold text-sm">N/A</span>
                          </div>
                        </div>

                        {/* 투표일시 (개선된 날짜 표시) */}
                        <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                          <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">📅</span>
                            </div>
                            <span className="font-bold text-point-800 text-sm">{t('label_vote_date')}</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <span className="text-gray-900 font-semibold text-sm block">
                              {formatRelativeDate(vote.createdAt)}
                            </span>
                            {/* 상세 시간 (호버 시 표시) */}
                            <span className="text-xs text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              {formatDate(vote.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 무한 스크롤 트리거 */}
          {!isEmpty && (
            <div ref={sentinelRef}>
              <InfiniteScrollTrigger 
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                isLastPage={isLastPage}
                translations={translations}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 