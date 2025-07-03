/**
 * 투표 관련 데이터 서비스
 *
 * 서버 컴포넌트와 클라이언트 컴포넌트에서 투표 데이터를 조회하는 서비스 함수들입니다.
 * 각 함수는 React의 cache를 사용하여 요청을 캐싱합니다.
 */

import { cache } from "react";
// 공개 데이터용 클라이언트 사용 (쿠키 없음)
import { createClient } from "@supabase/supabase-js";
import { CacheOptions } from "./fetchers";
import { Vote, VoteItem, VoteReward } from "@/types/interfaces";
import { SupabaseClient } from "@supabase/supabase-js";

// 공개 Supabase 클라이언트 생성 함수 (쿠키 없음)
function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

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
  options?: CacheOptions,
): Promise<Vote[]> => {
  try {
    const client = createPublicClient(); // 공개 클라이언트 사용
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
 * 투표 목록 조회 함수 (클라이언트용)
 */
export async function getVotesClient(
  client: SupabaseClient,
  status?: string,
  area?: string,
): Promise<Vote[]> {
  try {
    const query = buildVoteQuery(client, status, area);
    const { data, error } = await query;

    if (error) {
      console.error("[getVotesClient] 에러 발생:", error);
      throw error;
    }

    return transformVoteData(data || []);
  } catch (e) {
    console.error("[getVotesClient] 에러:", e);
    throw e;
  }
}

/**
 * 단일 투표 조회 함수 (서버용)
 */
export const getVoteById = cache(async (
  id: string | number,
  options?: CacheOptions,
): Promise<Vote | null> => {
  try {
    console.log("[getVoteById] 시작 - ID:", id, "Type:", typeof id);

    const client = createPublicClient(); // 공개 클라이언트 사용
    console.log("[getVoteById] 공개 Supabase 클라이언트 생성 완료");

    const { data, error } = await client
      .from("vote")
      .select(DEFAULT_VOTE_QUERY)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    console.log("[getVoteById] Supabase 쿼리 완료");
    console.log("[getVoteById] 에러:", error);
    console.log("[getVoteById] 데이터 존재:", !!data);

    if (error) {
      console.error("[getVoteById] Supabase 에러 발생:", error);
      console.error("[getVoteById] 에러 코드:", error.code);
      console.error("[getVoteById] 에러 메시지:", error.message);
      console.error("[getVoteById] 에러 세부사항:", error.details);
      return null;
    }

    if (!data) {
      console.log(
        "[getVoteById] 데이터가 null임 - ID가 존재하지 않거나 삭제됨:",
        id,
      );
      return null;
    }

    console.log("[getVoteById] 원본 데이터:", {
      id: data.id,
      title: data.title,
      deleted_at: data.deleted_at,
      vote_item_count: data.vote_item?.length || 0,
      vote_reward_count: data.vote_reward?.length || 0,
    });

    const transformedData = transformVoteData([data]);
    const result = transformedData[0] || null;

    console.log("[getVoteById] 변환된 데이터:", result ? "성공" : "실패");

    return result;
  } catch (e) {
    console.error("[getVoteById] 예외 발생:", e);
    console.error(
      "[getVoteById] 예외 스택:",
      e instanceof Error ? e.stack : "스택 없음",
    );
    return null;
  }
});

/**
 * 단일 투표 조회 함수 (클라이언트용)
 */
export async function getVoteByIdClient(
  client: SupabaseClient,
  id: string | number,
): Promise<Vote | null> {
  try {
    const { data, error } = await client
      .from("vote")
      .select(DEFAULT_VOTE_QUERY)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) {
      console.error("[getVoteByIdClient] 에러 발생:", error);
      throw error;
    }

    if (!data) {
      return null;
    }

    const transformedData = transformVoteData([data]);
    return transformedData[0] || null;
  } catch (e) {
    console.error("[getVoteByIdClient] 에러:", e);
    throw e;
  }
}
