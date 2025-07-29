'use client';

import { Vote } from '@/types/interfaces';
import { VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import useSWR from 'swr';

interface UseVoteListParams {
  status?: VoteStatus;
  area?: VoteArea;
  page?: number;
  limit?: number;
  initialVotes?: Vote[];
}

interface UseVoteListReturn {
  votes: Vote[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  totalCount: number;
  totalPages: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

/**
 * 투표 리스트를 관리하는 SWR 기반 훅
 */
export function useVoteList({ 
  status, 
  area, 
  page = 1,
  limit = 10,
  initialVotes = [] 
}: UseVoteListParams): UseVoteListReturn {

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (area) params.set('area', area);
  params.set('page', page.toString());
  params.set('limit', limit.toString());
  
  const { data, error, isLoading, mutate } = useSWR(`/api/votes?${params.toString()}`, fetcher, {
    fallbackData: initialVotes.length > 0 ? { data: initialVotes, count: initialVotes.length } : undefined,
  });

  return {
    votes: data?.data || [],
    isLoading,
    error,
    refetch: mutate,
    totalCount: data?.count || 0,
    totalPages: data?.totalPages || 1,
  };
} 