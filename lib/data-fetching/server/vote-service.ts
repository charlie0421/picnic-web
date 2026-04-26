import 'server-only';

import { cache } from "react";
import { createSupabaseServerClient, createPublicSupabaseServerClient } from '@/lib/supabase/server';
import { VOTE_STATUS } from '@/stores/voteFilterStore';
import { Vote } from "@/types/interfaces";
import {
  VoteWithRelations,
  VOTE_DETAIL_SELECT,
  transformVoteData,
  buildVoteQuery,
} from './vote-service-query';

// Re-export types/utilities so existing deep imports (if any) keep working
export type { VoteWithRelations };


/**
 * 투표 목록 조회 함수 (서버용)
 */
export const getVotes = cache(async (
  status?: string,
  area?: string,
  page?: number,
  limit?: number,
): Promise<VoteWithRelations[]> => {
  try {
    const client = createPublicSupabaseServerClient();
    let query = buildVoteQuery(client, status, area);

    // 페이지네이션이 지정된 경우에만 range 적용 (기본: 전체)
    if (page && limit) {
      const p = Math.max(1, page);
      const l = Math.max(1, Math.min(50, limit));
      const from = (p - 1) * l;
      const to = from + l - 1;
      query = query.range(from, to);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[getVotes] 에러 발생:", error);
      return [];
    }

    const transformedVotes = transformVoteData(data || []);

    if (status === VOTE_STATUS.ONGOING || status === VOTE_STATUS.COMPLETED) {
      const MAX_TOP_ITEMS = 3;

      return transformedVotes.map((vote) => {
        const items = vote.voteItem || [];
        const limitedItems = items.slice(0, MAX_TOP_ITEMS);

        return {
          ...vote,
          voteItem: limitedItems,
          vote_item: limitedItems,
        };
      });
    }

    if (status === VOTE_STATUS.UPCOMING) {
      const MAX_UPCOMING_ITEMS = 24;

      return transformedVotes.map((vote) => {
        const items = vote.voteItem || [];
        const limitedItems = items.slice(0, MAX_UPCOMING_ITEMS);

        return {
          ...vote,
          voteItem: limitedItems,
          vote_item: limitedItems,
        };
      });
    }

    return transformedVotes;
  } catch (e) {
    console.error("[getVotes] 에러:", e);
    return [];
  }
});


/**
 * 단일 투표 조회 함수 (서버용)
 */
export const getVoteById = cache(async (
  id: string | number,
): Promise<Vote | null> => {
  try {
    const client = createPublicSupabaseServerClient();
    const { data, error } = await client
      .from("vote")
      .select(VOTE_DETAIL_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) {
      console.error("[getVoteById] Supabase 에러 발생:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    const transformedData = transformVoteData([data]);
    return transformedData[0] || null;
  } catch (e) {
    console.error("[getVoteById] 예외 발생:", e);
    return null;
  }
});


/**
 * 투표 상세 정보 조회 함수 (서버용)
 *
 * 투표 기본 정보, 투표 아이템, 보상, 사용자 투표 기록을 모두 조회합니다.
 * React의 cache를 사용하여 요청을 캐싱합니다.
 */
export const getVoteDetails = cache(async (
  voteId: string | number,
) => {
  const numericVoteId = typeof voteId === 'string' ? parseInt(voteId, 10) : voteId;

  if (isNaN(numericVoteId)) {
    console.error('[getVoteDetails] Invalid vote ID format:', voteId);
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();

    // 1. 투표 기본 정보 및 아이템 정보 가져오기
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('*, vote_item(*, artist(*, artist_group(*)))')
      .eq('id', numericVoteId)
      .single();

    if (voteError || !vote) {
      console.error(`[getVoteDetails] Error fetching vote for id ${numericVoteId}:`, voteError);
      return null;
    }

    // 2. 보상 정보 가져오기
    const { data: rewards, error: rewardsError } = await supabase
      .from('vote_reward')
      .select('reward(*)')
      .eq('vote_id', numericVoteId);

    if (rewardsError) {
      console.error(`[getVoteDetails] Error fetching rewards for vote id ${numericVoteId}:`, rewardsError);
    }

    // 3. 사용자 정보 및 투표 기록 가져오기
    const { data: { user } } = await supabase.auth.getUser();

    let userVotes: { vote_item_id: number; vote_count: number }[] = [];
    if (user) {
      const { data, error: userVotesError } = await supabase
        .from('user_vote_history')
        .select('vote_item_id, vote_count')
        .eq('user_id', user.id)
        .eq('vote_id', numericVoteId);

      if (userVotesError) {
        console.error(`[getVoteDetails] Error fetching user vote history for user ${user.id}:`, userVotesError);
      } else {
        userVotes = data || [];
      }
    }

    return {
      vote,
      rewards: rewards ? rewards.map(r => r.reward) : [],
      user,
      userVotes,
    };
  } catch (error) {
    console.error(`[getVoteDetails] General error for voteId ${numericVoteId}:`, error);
    return null;
  }
});
