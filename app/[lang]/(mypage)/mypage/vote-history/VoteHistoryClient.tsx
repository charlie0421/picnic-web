'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { getCdnImageUrl } from '@/utils/api/image';
import { useLanguage } from '@/hooks/useLanguage';
import { useTranslations } from '@/hooks/useTranslations';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, EmptyState } from '@/components/mypage/MypageStates';
import Pagination from '@/components/common/molecules/Pagination';
import type { EmptyStateConfig } from '@/types/mypage-common';

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

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface StatisticsInfo {
  totalStarCandyUsed: number;
  totalSupportedArtists: number;
}

interface VoteHistoryClientProps {
  initialVoteHistory: VoteHistoryItem[];
  initialPagination: PaginationInfo;
  initialStatistics: StatisticsInfo;
  initialError: string | null;
}

export default function VoteHistoryClient({ 
  initialVoteHistory, 
  initialPagination, 
  initialStatistics, 
  initialError 
}: VoteHistoryClientProps) {
  const { 
    formatDate,
    getLocalizedText 
  } = useLanguage();
  const { tDynamic, translations } = useTranslations();
  const t = tDynamic;

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = '/images/default-artist.png';
    target.onerror = null;
  }, []);
  
  const emptyStateConfig: EmptyStateConfig = {
    title: t('label_no_vote_history_yet'),
    description: t('label_vote_for_favorite_artist'),
    actionLabel: t('label_go_to_vote'),
    actionUrl: '/vote',
    icon: '🗳️'
  };

  if (initialError) {
    return <ErrorState error={new Error(initialError)} onRetry={() => {}} translations={translations} />;
  }
  
  if (initialVoteHistory.length === 0) {
    return (
       <div className="container mx-auto px-4 py-6">
        <MypageHeader 
          config={{
            title: t('page_title_my_vote_history'),
            icon: '🗳️',
            backUrl: '/mypage',
            backLabel: t('label_back_to_mypage')
          }}
          statistics={[]}
          translations={translations}
        />
        <EmptyState 
          config={emptyStateConfig}
          translations={translations}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-6">
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
              value: initialPagination.totalCount,
              description: t('label_votes_description'),
              icon: '🗳️',
              bgColor: 'from-primary-50 to-primary-100',
              borderColor: 'border-primary-200/50',
              textColor: 'text-primary-800',
              isLoading: false
            },
            {
              id: 'secondary',
              title: t('label_total_star_candy_used'),
              value: initialStatistics.totalStarCandyUsed,
              description: t('label_amount_description'),
              icon: '💰',
              bgColor: 'from-secondary-50 to-secondary-100',
              borderColor: 'border-secondary-200/50',
              textColor: 'text-secondary-800',
              isLoading: false
            },
            {
              id: 'point',
              title: t('label_supported_artists'),
              value: initialStatistics.totalSupportedArtists,
              description: t('label_month_description'),
              icon: '📊',
              bgColor: 'from-point-50 to-point-100',
              borderColor: 'border-point-200/50',
              textColor: 'text-point-800',
              isLoading: false
            }
          ]}
          translations={translations}
        />

        <div className="space-y-6">
          <div className="space-y-6">
            {initialVoteHistory.map((vote, index) => (
              <div key={`${vote.id}-${index}`} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group">
                <div className="p-6">
                  <div className="space-y-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-3 border border-yellow-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">🎯</span>
                          </div>
                          <span className="font-bold text-yellow-800 text-sm">{t('label_vote_amount')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{vote.amount?.toLocaleString()}</span>
                      </div>
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
                          {formatDate(vote.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination 
            totalPages={initialPagination.totalPages}
            currentPage={initialPagination.page}
          />
        </div>
      </div>
    </div>
  );
}