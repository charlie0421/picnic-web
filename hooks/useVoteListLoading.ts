'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { VoteStatus, VoteArea } from '@/stores/voteFilterStore';

interface UseVoteListLoadingOptions {
  /** 로딩 지연 시간 (ms) - 너무 빨리 끝나는 경우 깜빡임 방지 */
  minLoadingTime?: number;
  /** 실제 데이터 로딩 완료까지의 최대 대기 시간 (ms) */
  maxLoadingTime?: number;
}

interface UseVoteListLoadingReturn {
  /** 현재 로딩 상태 */
  isLoading: boolean;
  /** 필터 변화를 수동으로 트리거 */
  triggerLoading: () => void;
  /** 로딩 완료 수동 트리거 */
  completeLoading: () => void;
  /** 현재 필터 상태 */
  currentFilters: {
    status: VoteStatus;
    area: VoteArea;
  };
}

/**
 * 투표 리스트의 필터 변화 시 로딩 상태를 관리하는 훅
 * 
 * @example
 * ```tsx
 * const { isLoading, currentFilters } = useVoteListLoading();
 * 
 * return (
 *   <div>
 *     {isLoading ? <VoteListSkeleton /> : <VoteList />}
 *   </div>
 * );
 * ```
 */
export function useVoteListLoading({
  minLoadingTime = 500,
  maxLoadingTime = 2000,
}: UseVoteListLoadingOptions = {}): UseVoteListLoadingReturn {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);

  // URL 파라미터에서 현재 필터 상태 추출
  const currentFilters = {
    status: (searchParams.get('status') as VoteStatus) || 'ongoing',
    area: (searchParams.get('area') as VoteArea) || 'all',
  };

  // 필터 변화 감지
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const startLoading = () => {
      setIsLoading(true);
      setLoadingStartTime(Date.now());

      // 최대 대기 시간 후 자동 완료
      timeoutId = setTimeout(() => {
        setIsLoading(false);
        setLoadingStartTime(null);
      }, maxLoadingTime);
    };

    // 필터 변화가 있으면 로딩 시작
    startLoading();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentFilters.status, currentFilters.area, maxLoadingTime]);

  // 수동 로딩 트리거
  const triggerLoading = useCallback(() => {
    setIsLoading(true);
    setLoadingStartTime(Date.now());

    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      setLoadingStartTime(null);
    }, maxLoadingTime);

    return () => clearTimeout(timeoutId);
  }, [maxLoadingTime]);

  // 수동 로딩 완료
  const completeLoading = useCallback(() => {
    const now = Date.now();
    const startTime = loadingStartTime;

    if (!startTime) {
      setIsLoading(false);
      return;
    }

    const elapsed = now - startTime;
    
    if (elapsed >= minLoadingTime) {
      // 최소 시간이 지났으면 즉시 완료
      setIsLoading(false);
      setLoadingStartTime(null);
    } else {
      // 최소 시간까지 대기 후 완료
      const remainingTime = minLoadingTime - elapsed;
      setTimeout(() => {
        setIsLoading(false);
        setLoadingStartTime(null);
      }, remainingTime);
    }
  }, [loadingStartTime, minLoadingTime]);

  return {
    isLoading,
    triggerLoading,
    completeLoading,
    currentFilters,
  };
} 