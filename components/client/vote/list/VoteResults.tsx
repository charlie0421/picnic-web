'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString, hasValidLocalizedString } from '@/utils/api/strings';
import { useLanguageStore } from '@/stores/languageStore';
import { useVoteStore } from '@/stores/voteStore';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

export interface VoteResultsProps {
  voteItems?: Array<VoteItem & { artist?: any }>;
  totalVotes?: number;
  isLoading?: boolean;
  showPercentage?: boolean;
  showRanking?: boolean;
  maxDisplayItems?: number;
  className?: string;
  title?: string;
  emptyMessage?: string;
  // 스토어 사용 여부 (기본값: true)
  useStore?: boolean;
}

export function VoteResults({
  voteItems: propVoteItems,
  totalVotes: propTotalVotes,
  isLoading: propIsLoading = false,
  showPercentage = true,
  showRanking = true,
  maxDisplayItems = 10,
  className = '',
  title = '투표 결과',
  emptyMessage = '투표 결과가 없습니다.',
  useStore = true
}: VoteResultsProps) {
  const { currentLanguage } = useLanguageStore();
  
  // Zustand 스토어 상태
  const { results } = useVoteStore();

  // 스토어 사용 여부에 따라 상태 결정
  const voteItems = useStore ? results.voteItems : (propVoteItems || []);
  const totalVotes = useStore ? results.totalVotes : propTotalVotes;
  const isLoading = useStore ? results.isLoading : propIsLoading;
  const error = useStore ? results.error : null;

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 투표 결과 정렬 및 계산
  const sortedResults = useMemo(() => {
    if (!voteItems || voteItems.length === 0) return [];

    // 투표수로 정렬 (내림차순)
    const sorted = [...voteItems].sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0));
    
    // 최대 표시 개수만큼 제한
    const limited = sorted.slice(0, maxDisplayItems);

    // 전체 투표수 계산
    const calculatedTotalVotes = totalVotes || voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0);

    // 퍼센티지 계산
    return limited.map((item, index) => {
      const voteCount = item.vote_total || 0;
      const percentage = calculatedTotalVotes > 0 ? (voteCount / calculatedTotalVotes) * 100 : 0;
      
      return {
        ...item,
        rank: index + 1,
        percentage: Math.round(percentage * 10) / 10, // 소수점 첫째자리까지
        voteCount
      };
    });
  }, [voteItems, totalVotes, maxDisplayItems]);

  // 스토어 에러 처리
  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
              <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 빈 상태
  if (!isMounted || sortedResults.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  // 랭킹 아이콘 및 색상
  const getRankingIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return { icon: '🥇', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' };
      case 2:
        return { icon: '🥈', color: 'text-gray-600 bg-gray-50 border-gray-200' };
      case 3:
        return { icon: '🥉', color: 'text-amber-600 bg-amber-50 border-amber-200' };
      default:
        return { icon: rank.toString(), color: 'text-gray-500 bg-white border-gray-200' };
    }
  };

  return (
    <div className={`p-6 ${className}`}>
      {/* 제목 */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            총 {sortedResults.reduce((sum, item) => sum + item.voteCount, 0).toLocaleString()}표
          </p>
          {useStore && results.lastUpdateTime && (
            <p className="text-xs text-gray-400">
              마지막 업데이트: {new Date(results.lastUpdateTime).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* 결과 목록 */}
      <div className="space-y-4">
        {sortedResults.map((item) => {
          const a = (item as any).artist;
          const artistName = a
            ? getLocalizedString(a.name, currentLanguage) || '아티스트'
            : '아티스트';
          
          const artistGroup = a?.artistGroup?.name && hasValidLocalizedString(a.artistGroup.name)
            ? getLocalizedString(a.artistGroup.name, currentLanguage)
            : null;
          
          const imageSrc = a?.image || null;

          const rankInfo = getRankingIcon(item.rank);

          return (
            <div
              key={item.id}
              className={`relative flex items-center p-4 rounded-xl border transition-all duration-200 ${
                item.rank <= 3 ? 'shadow-md' : 'shadow-sm'
              } ${rankInfo.color}`}
            >
              {/* 랭킹 */}
              {showRanking && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full border font-bold text-sm mr-4 flex-shrink-0">
                  {rankInfo.icon}
                </div>
              )}

              {/* 아티스트 이미지 */}
              <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 shadow-sm mr-4 flex-shrink-0 relative">
                <OptimizedImage
                  src={imageSrc || '/images/default-artist.png'}
                  alt={artistName}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  fallbackSrc="/images/default-artist.png"
                />
              </div>

              {/* 아티스트 정보 */}
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="font-semibold text-gray-900 truncate">
                  {artistName}
                </h3>
                {artistGroup && (
                  <p className="text-sm text-gray-600 truncate">
                    {artistGroup}
                  </p>
                )}
                
                {/* 프로그레스 바 */}
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${item.percentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* 투표 결과 */}
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-gray-900">
                  {item.voteCount.toLocaleString()}표
                </div>
                {showPercentage && (
                  <div className="text-sm text-primary font-medium">
                    {item.percentage}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 더 많은 결과가 있는 경우 안내 */}
      {voteItems.length > maxDisplayItems && (
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            상위 {maxDisplayItems}위까지 표시 (전체 {voteItems.length}개 항목)
          </p>
        </div>
      )}
    </div>
  );
}

export default VoteResults; 