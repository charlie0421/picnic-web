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

/**
 * 향상된 투표 결과 조회 API 호출
 */
export const getVoteResultsEnhanced = withPerformanceMonitoring(
  withVoteOptimization(async (voteId: number): Promise<VoteResultsResponse> => {
    const now = Date.now();
    
    // 캐시 확인
    const cached = voteResultsCache.get(voteId);
    if (cached && now - cached.timestamp < RESULTS_CACHE_TTL) {
      return cached.data;
    }

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
    try {
      return await getVoteByIdClient(supabaseClient, Number(voteId));
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
    try {
      const result = await getVotesClient(supabaseClient);
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
  } else {
    voteResultsCache.clear();
  }
}

// 기존 API와 호환성을 위한 exports
export const getVoteResults = getVoteResultsEnhanced;
export const fetchVoteDetail = fetchVoteDetailEnhanced;
export const fetchVoteList = fetchVoteListEnhanced;
export const calculateVoteStatus = calculateVoteStatusEnhanced;
export const calculateTimeLeft = calculateTimeLeftEnhanced; 