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
    // vote.id 는 number 다. 호출부가 라우트 파라미터(string)를 그대로 넘기므로 여기서 좁힌다.
    const numericId = typeof id === 'string' ? Number(id) : id;
    if (!Number.isFinite(numericId)) {
      console.error('[getVoteById] Invalid vote ID format:', id);
      return null;
    }

    const client = createPublicSupabaseServerClient();
    const { data, error } = await client
      .from("vote")
      .select(VOTE_DETAIL_SELECT)
      .eq("id", numericId)
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


