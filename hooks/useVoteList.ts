'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Vote } from '@/types/interfaces';
import { VoteStatus, VoteArea } from '@/stores/voteFilterStore';
import { getVotesClient } from '@/lib/data-fetching/vote-service';

interface UseVoteListParams {
  status?: VoteStatus;
  area?: VoteArea;
  initialVotes?: Vote[];
}

interface UseVoteListReturn {
  votes: Vote[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * 투표 리스트를 관리하는 단순화된 훅
 */
export function useVoteList({ 
  status, 
  area, 
  initialVotes = [] 
}: UseVoteListParams): UseVoteListReturn {
  const supabase = createBrowserSupabaseClient();
  const [votes, setVotes] = useState<Vote[]>(initialVotes);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchVotes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await getVotesClient(supabase, status, area);
      setVotes(data);
    } catch (err) {
      console.error('투표 데이터 로드 오류:', err);
      setError(err as Error);
      setVotes([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, status, area]);

  // 초기 로드 및 필터 변경 시 데이터 페칭
  useEffect(() => {
    if (initialVotes.length === 0) {
      fetchVotes();
    }
  }, [fetchVotes, initialVotes.length]);

  return {
    votes,
    isLoading,
    error,
    refetch: fetchVotes,
  };
} 