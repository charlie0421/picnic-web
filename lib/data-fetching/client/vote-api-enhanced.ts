/**
 * 향상된 투표 시스템 API 서비스
 * 
 * 기존 vote-api.ts를 기반으로 성능 최적화 기능을 추가:
 * - 회로 차단기 패턴
 * - 지능형 재시도
 * - 요청 큐잉
 * - 캐싱 전략
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Vote, VoteItem } from '@/types/interfaces';
import { getVoteByIdClient, getVotesClient } from './vote-service.client';
import {
  withVoteOptimization,
  withPerformanceMonitoring,
  PerformanceMetrics,
  getCircuitBreakerStats
} from '@/utils/api/enhanced-retry-utils';

// API 응답 타입 정의 (기존과 동일)
export interface VoteSubmissionRequest {
  voteId: number;
  voteItemId: number;
  amount: number;
  userId: string;
  totalBonusRemain: number;
}

export interface VoteSubmissionResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: string;
  message?: string;
}



export interface VoteResultsResponse {
  voteId: number;
  title: any;
  status: 'upcoming' | 'ongoing' | 'ended';
  totalVotes: number;
  results: VoteResultItem[];
}

export interface VoteResultItem {
  id: number;
  voteId: number;
  artistId: number | null;
  groupId: number;
  voteTotal: number;
  artist: any;
  percentage: number;
  rank: number;
}

// 투표 결과 캐시 관리
interface VoteResultsCache {
  data: VoteResultsResponse;
  timestamp: number;
}

const voteResultsCache = new Map<number, VoteResultsCache>();
const RESULTS_CACHE_TTL = 30 * 1000; // 30초

// 요청 큐 관리
interface QueuedRequest {
  id: string;
  promise: Promise<any>;
  timestamp: number;
}

const requestQueue = new Map<string, QueuedRequest>();

/**
 * 중복 요청 방지 함수
 */
function withDuplicateRequestPrevention<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  getKey: (...args: Parameters<T>) => string
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const key = getKey(...args);
    const now = Date.now();

    // 기존 요청 확인
    const existing = requestQueue.get(key);
    if (existing && now - existing.timestamp < 10000) { // 10초 내 중복 요청 방지
      console.log(`[Enhanced Vote API] 중복 요청 방지: ${key}`);
      return existing.promise;
    }

    // 새 요청 생성
    const promise = fn(...args);
    requestQueue.set(key, {
      id: key,
      promise,
      timestamp: now
    });

    // 요청 완료 후 큐에서 제거
    promise.finally(() => {
      requestQueue.delete(key);
    });

    return promise;
  };
}

/**
 * 향상된 투표 제출 API 호출
 */
export const submitVoteEnhanced = withDuplicateRequestPrevention(
  withPerformanceMonitoring(
    withVoteOptimization(async (request: VoteSubmissionRequest): Promise<VoteSubmissionResponse> => {
      console.log('[Enhanced Vote API] 투표 제출 시작:', {
        voteId: request.voteId,
        voteItemId: request.voteItemId,
        amount: request.amount,
        userId: request.userId?.slice(0, 8) + '...'
      });

      try {
        const response = await fetch('/api/vote/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        });

        const result = await response.json();

        if (!response.ok) {
          console.warn('[Enhanced Vote API] 투표 제출 실패:', {
            status: response.status,
            error: result.error
          });

          return {
            success: false,
            error: result.error || 'Failed to submit vote',
            details: result.details
          };
        }

        console.log('[Enhanced Vote API] 투표 제출 성공');

        // 성공 시 관련 캐시 무효화
        voteResultsCache.delete(request.voteId);

        return result;
      } catch (error) {
        console.error('[Enhanced Vote API] 투표 제출 예외:', error);
        return {
          success: false,
          error: 'Network error occurred while submitting vote'
        };
      }
    }),
    'vote_submission'
  ),
  (request) => `vote_submit_${request.voteId}_${request.voteItemId}_${request.userId}`
);

/**
 * 향상된 투표 결과 조회 API 호출
 */
export const getVoteResultsEnhanced = withPerformanceMonitoring(
  withVoteOptimization(async (voteId: number): Promise<VoteResultsResponse> => {
    const now = Date.now();
    
    // 캐시 확인
    const cached = voteResultsCache.get(voteId);
    if (cached && now - cached.timestamp < RESULTS_CACHE_TTL) {
      console.log('[Enhanced Vote API] 캐시된 투표 결과 사용:', voteId);
      return cached.data;
    }

    console.log('[Enhanced Vote API] 투표 결과 조회 시작:', voteId);

    try {
      const response = await fetch(`/api/vote/results?voteId=${voteId}`);
      const result = await response.json();

      if (!response.ok) {
        console.warn('[Enhanced Vote API] 투표 결과 조회 실패:', {
          voteId,
          status: response.status,
          error: result.error
        });

        throw new Error(result.error || 'Failed to fetch vote results');
      }

      console.log('[Enhanced Vote API] 투표 결과 조회 성공:', voteId);

      // 캐시에 저장
      voteResultsCache.set(voteId, {
        data: result.data,
        timestamp: now
      });

      return result.data;
    } catch (error) {
      console.error('[Enhanced Vote API] 투표 결과 조회 예외:', error);
      throw new Error('Network error occurred while fetching vote results');
    }
  }),
  'vote_results'
);



/**
 * 투표 상세 정보 조회 (향상된 버전)
 */
export const fetchVoteDetailEnhanced = withPerformanceMonitoring(
  withVoteOptimization(async (supabaseClient: SupabaseClient, voteId: string | number): Promise<Vote | null> => {
    console.log('[Enhanced Vote API] 투표 상세 정보 조회 시작:', voteId);

    try {
      const result = await getVoteByIdClient(supabaseClient, Number(voteId));
      
      if (result) {
        console.log('[Enhanced Vote API] 투표 상세 정보 조회 성공:', voteId);
      } else {
        console.warn('[Enhanced Vote API] 투표 상세 정보 없음:', voteId);
      }

      return result;
    } catch (error) {
      console.error('[Enhanced Vote API] 투표 상세 정보 조회 예외:', error);
      return null;
    }
  }),
  'vote_detail_fetch'
);

/**
 * 투표 목록 조회 (향상된 버전)
 */
export const fetchVoteListEnhanced = withPerformanceMonitoring(
  withVoteOptimization(async (supabaseClient: SupabaseClient): Promise<Vote[]> => {
    console.log('[Enhanced Vote API] 투표 목록 조회 시작');

    try {
      const result = await getVotesClient(supabaseClient);
      
      console.log('[Enhanced Vote API] 투표 목록 조회 성공:', {
        count: result?.length || 0
      });

      return result || [];
    } catch (error) {
      console.error('[Enhanced Vote API] 투표 목록 조회 예외:', error);
      return [];
    }
  }),
  'vote_list_fetch'
);

/**
 * 투표 상태 계산 (캐시된 버전)
 */
export function calculateVoteStatusEnhanced(vote: Vote): 'upcoming' | 'ongoing' | 'ended' {
  if (!vote.start_at || !vote.stop_at) return 'ended';

  const now = new Date();
  const startAt = new Date(vote.start_at);
  const stopAt = new Date(vote.stop_at);

  if (now < startAt) return 'upcoming';
  if (now >= startAt && now <= stopAt) return 'ongoing';
  return 'ended';
}

/**
 * 투표 남은 시간 계산 (최적화된 버전)
 */
export function calculateTimeLeftEnhanced(vote: Vote): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
} {
  const status = calculateVoteStatusEnhanced(vote);
  const now = new Date();

  let targetTime: Date;
  if (status === 'upcoming') {
    targetTime = new Date(vote.start_at!);
  } else if (status === 'ongoing') {
    targetTime = new Date(vote.stop_at!);
  } else {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }

  const totalSeconds = Math.max(0, Math.floor((targetTime.getTime() - now.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds };
}

/**
 * 성능 통계 조회
 */
export function getVoteAPIPerformanceStats() {
  return PerformanceMetrics.getMetrics();
}

/**
 * 회로 차단기 상태 조회
 */
export function getVoteAPICircuitStats() {
  return getCircuitBreakerStats();
}

/**
 * 캐시 무효화
 */
export function clearVoteResultsCache(voteId?: number) {
  if (voteId) {
    voteResultsCache.delete(voteId);
    console.log(`[Enhanced Vote API] 투표 결과 캐시 무효화: ${voteId}`);
  } else {
    voteResultsCache.clear();
    console.log('[Enhanced Vote API] 모든 투표 결과 캐시 무효화');
  }
}

/**
 * 요청 큐 상태 조회
 */
export function getRequestQueueStatus() {
  return {
    queueSize: requestQueue.size,
    requests: Array.from(requestQueue.keys())
  };
}

// 기존 API와 호환성을 위한 exports
export const submitVote = submitVoteEnhanced;
export const getVoteResults = getVoteResultsEnhanced;
export const fetchVoteDetail = fetchVoteDetailEnhanced;
export const fetchVoteList = fetchVoteListEnhanced;
export const calculateVoteStatus = calculateVoteStatusEnhanced;
export const calculateTimeLeft = calculateTimeLeftEnhanced; 