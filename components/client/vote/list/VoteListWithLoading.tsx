'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { VoteListPresenter, VoteFilterSection } from './index';
import VoteListSkeleton from '@/components/server/vote/VoteListSkeleton';
import { useVoteListLoading } from '@/hooks/useVoteListLoading';
import { VOTE_STATUS, VOTE_AREAS, VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import { Vote } from '@/types/interfaces';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { buildVoteQuery, formatVoteData } from '@/utils/vote-data-formatter';

interface VoteListWithLoadingProps {
  /** 초기 투표 데이터 (서버에서 렌더링된 데이터) */
  initialVotes?: Vote[];
  /** 초기 필터 상태 */
  initialStatus?: VoteStatus;
  initialArea?: VoteArea;
  /** 추가 CSS 클래스 */
  className?: string;
  /** 로딩 시간 옵션 */
  loadingOptions?: {
    minLoadingTime?: number;
    maxLoadingTime?: number;
  };
}

/**
 * 필터 변화 시 스켈레톤을 표시하는 투표 리스트 컴포넌트
 * 
 * 이 컴포넌트는 다음 기능을 제공합니다:
 * - 필터 변화 감지 및 로딩 상태 관리
 * - 스켈레톤 UI 표시
 * - 클라이언트 사이드 데이터 페칭
 * - 초기 서버 렌더링 데이터 활용
 * 
 * @example
 * ```tsx
 * <VoteListWithLoading 
 *   initialVotes={serverVotes}
 *   initialStatus="ongoing"
 *   initialArea="all"
 * />
 * ```
 */
export function VoteListWithLoading({
  initialVotes = [],
  initialStatus = VOTE_STATUS.ONGOING,
  initialArea = VOTE_AREAS.ALL,
  className = '',
  loadingOptions,
}: VoteListWithLoadingProps) {
  const [votes, setVotes] = useState<Vote[]>(initialVotes);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 필터 로딩 상태 관리
  const { 
    isLoading: isFilterLoading, 
    currentFilters, 
    completeLoading 
  } = useVoteListLoading(loadingOptions);

  // 이전 필터 상태 추적
  const [prevFilters, setPrevFilters] = useState({
    status: initialStatus,
    area: initialArea,
  });

  // 데이터 페칭 함수
  const fetchVotes = useCallback(async (status: VoteStatus, area: VoteArea) => {
    try {
      setIsLoading(true);
      setError(null);

      const supabase = createBrowserSupabaseClient();
      const query = buildVoteQuery(supabase, status, area);
      const { data: voteData, error: fetchError } = await query;

      if (fetchError) {
        console.error('Vote fetch error:', fetchError);
        setError('투표 데이터를 불러오는데 실패했습니다.');
        return;
      }

      if (!voteData || voteData.length === 0) {
        setVotes([]);
        return;
      }

      const formattedVotes = formatVoteData(voteData);
      setVotes(formattedVotes);
      
    } catch (error) {
      console.error('fetchVotes error:', error);
      setError('투표 데이터를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
      // 필터 로딩도 완료 처리
      completeLoading();
    }
  }, [completeLoading]);

  // 필터 변화 감지 및 데이터 페칭
  useEffect(() => {
    const { status, area } = currentFilters;
    
    // 초기 로드가 아니고 필터가 실제로 변경된 경우에만 페칭
    const isInitialLoad = status === initialStatus && area === initialArea && votes.length === 0;
    const hasFilterChanged = status !== prevFilters.status || area !== prevFilters.area;
    
    if (!isInitialLoad && hasFilterChanged) {
      fetchVotes(status, area);
      setPrevFilters({ status, area });
    }
  }, [currentFilters, fetchVotes, initialStatus, initialArea, prevFilters, votes.length]);

  // 초기 데이터가 없는 경우 초기 페칭
  useEffect(() => {
    if (initialVotes.length === 0) {
      fetchVotes(initialStatus, initialArea);
    }
  }, [fetchVotes, initialStatus, initialArea, initialVotes.length]);

  // 로딩 상태 결정 (필터 로딩 또는 데이터 로딩)
  const showLoading = isFilterLoading || isLoading;

  // 에러 상태 렌더링
  if (error && !showLoading) {
    return (
      <div className={className}>
        <VoteFilterSection />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4">
            <svg
              className="w-16 h-16 text-red-300 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <button
            onClick={() => fetchVotes(currentFilters.status, currentFilters.area)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <VoteFilterSection />
      
      {showLoading ? (
        <VoteListSkeleton 
          itemCount={6}
          showFilterSkeleton={false} // 필터는 이미 위에 표시됨
          layout="grid"
          animated={true}
          className="mt-6"
        />
      ) : (
        <VoteListPresenter 
          votes={votes}
          className="mt-6"
        />
      )}
    </div>
  );
} 