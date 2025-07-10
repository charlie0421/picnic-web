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
}

interface VoteHistoryClientProps {
  initialUser: User;
  translations: Translations;
}

export default function VoteHistoryClient({ initialUser, translations }: VoteHistoryClientProps) {
  const { getLocalizedText, formatDate } = useLanguage();
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
      <div className="container mx-auto px-4 py-4 max-w-4xl">
        {/* 헤더 */}
        <MypageHeader 
          config={headerConfig}
          statistics={statisticsCards}
          translations={translations}
        />

        {/* 오류 상태 */}
        {error && (
          <div className="mb-4">
            <ErrorState 
              error={error}
              onRetry={retry}
              translations={translations}
            />
          </div>
        )}

        {/* 초기 로딩 상태 */}
        {(isLoading || isInitialLoad) && voteHistory.length === 0 && !error && (
          <InitialLoadingState translations={translations} />
        )}

        {/* 빈 상태 */}
        {isEmpty && (
          <EmptyState 
            config={emptyStateConfig}
            translations={translations}
          />
        )}

        {/* 투표 내역 리스트 */}
        <div className="space-y-4">
          {voteHistory.map((item, index) => (
            <div 
              key={item.id} 
              className="group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-md hover:shadow-lg border border-white/30 overflow-hidden transition-all duration-300 transform hover:scale-[1.01] hover:-translate-y-1"
              style={{
                animationDelay: `${index * 50}ms`
              }}
            >
              {/* 상단 그라데이션 바 */}
              <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
              
              {/* 배경 데코레이션 */}
              <div className="absolute top-2 right-2 w-12 h-12 bg-gradient-to-br from-primary-50 to-point-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="relative p-4">
                <div className="flex items-start space-x-4">
                  {/* 아티스트 이미지 */}
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-100 to-secondary-100 shadow-md group-hover:shadow-lg transition-all duration-300 border border-white/50">
                        <img
                          src={getCdnImageUrl(item.voteItem?.artist?.image, 150) || '/images/default-artist.png'}
                          alt={getLocalizedText(item.voteItem?.artist?.name) || t('label_artist')}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          onError={handleImageError}
                        />
                      </div>
                      {/* 호버시 나타나는 글로우 효과 */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      {/* 투표 상태 인디케이터 */}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-sub to-point rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    </div>
                  </div>

                  {/* 투표 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-1">
                          {getLocalizedText(item.vote?.title) || t('label_no_title')}
                        </h3>
                        <div className="h-0.5 w-12 bg-gradient-to-r from-primary to-point rounded-full"></div>
                      </div>
                      {item.vote && (
                        <div className="flex-shrink-0 ml-4">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-lg border ${
                            getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' 
                              ? 'bg-gradient-to-r from-green-500 to-secondary text-white border-green-600' :
                            getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended' 
                              ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-700' :
                              'bg-gradient-to-r from-blue-500 to-primary text-white border-blue-600'
                          }`}>
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' && t('label_vote_status_ongoing')}
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended' && t('label_vote_status_ended')}
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'upcoming' && t('label_vote_status_upcoming')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* 아티스트 정보 */}
                      <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-3 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-primary to-point rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">🎤</span>
                          </div>
                          <span className="font-bold text-primary-800 text-sm">{t('label_artist_name')}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="font-semibold text-gray-900 text-sm">{getLocalizedText(item.voteItem?.artist?.name) || t('label_unknown')}</span>
                          {(() => {
                            const groupId = item.voteItem?.artist?.artistGroup?.id;
                            const groupName = item.voteItem?.artist?.artistGroup?.name ? getLocalizedText(item.voteItem.artist.artistGroup.name) : '';
                            return groupId && groupId > 0 && groupName && groupName.trim() !== '' ? (
                              <>
                                <span className="text-primary-400 font-bold text-xs">{t('label_group_separator')}</span>
                                <span className="text-primary-700 font-medium text-xs">{groupName}</span>
                              </>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      
                      {/* 투표 금액 */}
                      <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-xl p-3 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-sub to-secondary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">💰</span>
                          </div>
                          <span className="font-bold text-sub-800 text-sm">{t('label_vote_amount')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="relative">
                            <img 
                              src="/images/star-candy/star_100.png" 
                              alt={t('label_star_candy')} 
                              className="w-5 h-5 shadow-sm" 
                            />
                          </div>
                          <span className="text-lg font-bold bg-gradient-to-r from-sub to-secondary bg-clip-text text-transparent">
                            {item.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* 투표 날짜 */}
                      <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-xl p-3 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-secondary to-primary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📅</span>
                          </div>
                          <span className="font-bold text-secondary-800 text-sm">{t('label_vote_date')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{formatDate(item.createdAt)}</span>
                      </div>

                      {/* 투표 카테고리 */}
                      {item.vote?.voteCategory && (
                        <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                          <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">🏷️</span>
                            </div>
                            <span className="font-bold text-point-800 text-sm">{t('label_vote_category')}</span>
                          </div>
                          <span className="inline-flex items-center px-2 py-1 bg-white/80 text-point-800 rounded-lg text-xs font-semibold shadow-sm border border-point-200/50">
                            {getLocalizedText(item.vote?.voteCategory)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

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
  );
} 