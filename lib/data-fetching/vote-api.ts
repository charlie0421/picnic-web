/**
 * 투표 시스템 API 서비스
 * 
 * 클라이언트 사이드에서 투표 관련 API를 호출하는 서비스 함수들입니다.
 * Zustand 스토어와 통합하여 사용하도록 설계되었습니다.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Vote, VoteItem } from '@/types/interfaces';
import { getVoteByIdClient, getVotesClient } from './client/vote-service.client';

// API 응답 타입 정의
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
  message?: string;
  error?: string;
  details?: string;
}

export interface VoteResultsResponse {
  success: boolean;
  data?: {
    voteId: number;
    title: string;
    status: 'upcoming' | 'ongoing' | 'ended';
    totalVotes: number;
    results: Array<{
      id: number;
      voteId: number;
      artistId: number | null;
      groupId: number;
      voteTotal: number | null;
      artist: {
        id: number;
        name: string;
        image: string | null;
        artistGroup: {
          id: number;
          name: string;
        } | null;
      } | null;
      percentage: number;
      rank: number;
    }>;
  };
  error?: string;
  details?: string;
}

/**
 * 투표 제출 API 호출
 */
export async function submitVote(request: VoteSubmissionRequest): Promise<VoteSubmissionResponse> {
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
      return {
        success: false,
        error: result.error || 'Failed to submit vote',
        details: result.details
      };
    }

    return result;
  } catch (error) {
    console.error('Vote submission error:', error);
    return {
      success: false,
      error: 'Network error occurred while submitting vote'
    };
  }
}

/**
 * 투표 결과 조회 API 호출
 */
export async function getVoteResults(voteId: number): Promise<VoteResultsResponse> {
  try {
    const response = await fetch(`/api/vote/results?voteId=${voteId}`);
    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to fetch vote results',
        details: result.details
      };
    }

    return result;
  } catch (error) {
    console.error('Vote results fetch error:', error);
    return {
      success: false,
      error: 'Network error occurred while fetching vote results'
    };
  }
}

/**
 * 투표 상세 정보 조회 (Supabase 직접 호출)
 */
export async function fetchVoteDetail(
  supabaseClient: SupabaseClient,
  voteId: string | number
): Promise<{ vote: Vote | null; voteItems: VoteItem[]; error?: string }> {
  try {
    const vote = await getVoteByIdClient(supabaseClient, voteId);
    
    if (!vote) {
      return {
        vote: null,
        voteItems: [],
        error: 'Vote not found'
      };
    }

    return {
      vote,
      voteItems: ((vote as any)?.vote_item as VoteItem[]) || ((vote as any)?.voteItem as VoteItem[]) || [],
    };
  } catch (error) {
    console.error('Vote detail fetch error:', error);
    return {
      vote: null,
      voteItems: [],
      error: 'Failed to fetch vote details'
    };
  }
}

/**
 * 투표 목록 조회 (Supabase 직접 호출)
 */
export async function fetchVoteList(
  supabaseClient: SupabaseClient,
  status?: string,
  area?: string
): Promise<{ votes: Vote[]; error?: string }> {
  try {
    const votes = await getVotesClient(supabaseClient, status, area);
    
    return {
      votes,
    };
  } catch (error) {
    console.error('Vote list fetch error:', error);
    return {
      votes: [],
      error: 'Failed to fetch vote list'
    };
  }
}

/**
 * 투표 상태 계산 유틸리티
 */
export function calculateVoteStatus(startAt: string, stopAt: string): 'upcoming' | 'ongoing' | 'ended' {
  const now = new Date();
  const start = new Date(startAt);
  const stop = new Date(stopAt);

  if (now < start) {
    return 'upcoming';
  } else if (now >= start && now <= stop) {
    return 'ongoing';
  } else {
    return 'ended';
  }
}

/**
 * 투표 남은 시간 계산 유틸리티
 */
export function calculateTimeLeft(targetDate: string): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const difference = target - now;

  if (difference <= 0) {
    return null;
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
} 