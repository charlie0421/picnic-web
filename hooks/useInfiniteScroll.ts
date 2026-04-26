import { useState, useEffect, useCallback, useRef } from 'react';
import type { InfiniteScrollState, BaseResponse } from '@/types/mypage-common';

interface UseInfiniteScrollOptions<T> {
  apiEndpoint: string;
  limit?: number;
  onSuccess?: (data: BaseResponse<T>) => void;
  onError?: (error: string) => void;
  transform?: (data: any) => T;
}

export function useInfiniteScroll<T>(options: UseInfiniteScrollOptions<T>) {
  const { apiEndpoint, limit = 10, onSuccess, onError, transform } = options;

  // Stable refs for callbacks/transform so fetchData identity stays stable
  // across renders even when callers pass inline arrow functions. The prior
  // implementation listed onSuccess/onError/transform in fetchData's deps,
  // making fetchData re-create every render and re-arming the
  // IntersectionObserver effect (deps include fetchData). Combined with the
  // initial-load effect's empty deps, the first call closed over a stale
  // fetchData on first render.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const transformRef = useRef(transform);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    transformRef.current = transform;
  }, [onSuccess, onError, transform]);

  // 상태 관리
  const [state, setState] = useState<InfiniteScrollState>({
    page: 1,
    isLoading: false,
    hasMore: false,
    isLoadingMore: false,
    isInitialLoad: true,
    error: null,
    totalCount: 0
  });

  const [items, setItems] = useState<T[]>([]);
  const [statistics, setStatistics] = useState<any>({});

  // Refs
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 데이터 패치 함수
  const fetchData = useCallback(async (pageNum: number, reset: boolean = false) => {
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // 새로운 AbortController 생성
    abortControllerRef.current = new AbortController();
    
    setState(prev => ({
      ...prev,
      ...(reset ? { isLoading: true } : { isLoadingMore: true }),
      error: null
    }));

    try {
      const response = await fetch(`${apiEndpoint}?page=${pageNum}&limit=${limit}`, {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: 데이터 조회에 실패했습니다.`);
      }

      const data: BaseResponse<T> = await response.json();

      if (data.success) {
        // 데이터 변환 적용 — read latest transform via ref so fetchData stays stable
        const t = transformRef.current;
        const transformedData = t
          ? data.data.map(t)
          : data.data;

        setItems(prev => reset ? transformedData : [...prev, ...transformedData]);
        
        setState(prev => ({
          ...prev,
          totalCount: data.pagination.totalCount,
          hasMore: data.pagination.hasNext,
          isInitialLoad: false,
          page: reset ? 1 : pageNum
        }));

        // 통계 데이터가 있으면 설정
        if ('statistics' in data) {
          setStatistics((data as any).statistics);
        }

        onSuccessRef.current?.(data);
      } else {
        throw new Error(data.error || '데이터 조회에 실패했습니다.');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isInitialLoad: false
      }));

      onErrorRef.current?.(errorMessage);
    } finally {
      setState(prev => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false
      }));
    }
  }, [apiEndpoint, limit]);

  // 재시도 함수
  const retry = useCallback(() => {
    setState({
      page: 1,
      isLoading: false,
      hasMore: false,
      isLoadingMore: false,
      isInitialLoad: true,
      error: null,
      totalCount: 0
    });
    setItems([]);
    setStatistics({});
    fetchData(1, true);
  }, [fetchData]);

  // 무한 스크롤 처리
  useEffect(() => {
    if (!sentinelRef.current || !state.hasMore || state.isLoadingMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    
    // 기존 observer 정리
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && state.hasMore && !state.isLoadingMore) {
          const nextPage = state.page + 1;
          fetchData(nextPage, false);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observerRef.current.observe(sentinel);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [state.hasMore, state.isLoadingMore, state.page, fetchData]);

  // 초기 데이터 로드
  useEffect(() => {
    fetchData(1, true);
  }, []);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // 상태
    ...state,
    items,
    statistics,
    
    // Refs
    sentinelRef,
    
    // 함수들
    retry,
    fetchData,
    
    // 편의 함수들
    isEmpty: !state.isLoading && !state.isInitialLoad && items.length === 0 && !state.error,
    isLastPage: !state.isLoading && !state.isInitialLoad && !state.hasMore && items.length > 0
  };
} 