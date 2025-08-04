'use server';

import { cache } from "react";
import { createSupabaseServerClient, createPublicSupabaseServerClient } from '@/lib/supabase/server';
import { Vote, VoteItem, VoteReward } from "@/types/interfaces";
import { SupabaseClient } from "@supabase/supabase-js";

// 기본 투표 테이블 조회 쿼리
const DEFAULT_VOTE_QUERY = `
  *,
  vote_item!vote_id (
    id,
    vote_id,
    artist_id,
    group_id,
    vote_total,
    created_at,
    updated_at,
    deleted_at,
    artist (
      id,
      name,
      image,
      artist_group (
        id,
        name
      )
    )
  ),
  vote_reward (
    reward_id,
    reward:reward_id (*)
  )
`;

/**
 * 투표 데이터를 표준 형식으로 변환
 */
function transformVoteData(data: any[]): Vote[] {
  return data.map((vote) => {
    const voteItem: VoteItem[] = vote.vote_item?.map((item: any) => ({
      ...item,
      artist: item.artist
        ? {
          id: item.artist.id,
          name: item.artist.name,
          image: item.artist.image,
          artistGroup: item.artist.artist_group,
        }
        : null,
    })) || [];

    const voteReward: VoteReward[] = vote.vote_reward?.map((vr: any) => ({
      ...vr,
      reward: vr.reward
        ? {
          id: vr.reward.id,
          name: vr.reward.name,
          image: vr.reward.image,
        }
        : null,
    })) || [];

    return {
      ...vote,
      voteItem,
      voteReward,
    };
  });
}

/**
 * 공통 투표 쿼리 빌더
 */
function buildVoteQuery(
  client: SupabaseClient,
  status?: string,
  area?: string,
) {
  let query = client
    .from("vote")
    .select(DEFAULT_VOTE_QUERY)
    .is("deleted_at", null)
    .lte("visible_at", new Date().toISOString());

  // 상태 필터링
  if (status) {
    const now = new Date().toISOString();

    switch (status) {
      case "upcoming":
        query = query.gt("start_at", now);
        break;
      case "ongoing":
        query = query
          .lte("start_at", now)
          .gt("stop_at", now);
        break;
      case "completed":
        query = query.lte("stop_at", now);
        break;
    }
  }

  // 지역 필터링 - 'all'인 경우 필터링하지 않음
  if (area && area !== 'all') {
    query = query.eq("area", area);
  }

  return query.order("start_at", { ascending: false });
}


/**
 * 투표 목록 조회 함수 (서버용)
 */
export const getVotes = cache(async (
  status?: string,
  area?: string,
): Promise<Vote[]> => {
  try {
    const client = createPublicSupabaseServerClient();
    const query = buildVoteQuery(client, status, area);
    const { data, error } = await query;

    if (error) {
      console.error("[getVotes] 에러 발생:", error);
      return [];
    }

    return transformVoteData(data || []);
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
      .select(DEFAULT_VOTE_QUERY)
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
