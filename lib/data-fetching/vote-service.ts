/**
 * 투표 관련 데이터 서비스
 *
 * 서버 컴포넌트에서 투표 데이터를 조회하는 서비스 함수들입니다.
 * 각 함수는 React의 cache를 사용하여 요청을 캐싱합니다.
 */

import { cache } from "react";
import { createClient } from "@/utils/supabase-server-client";
import { CacheOptions } from "./fetchers";
import { Vote, VoteItem } from "@/types/interfaces";

// 기본 투표 테이블 조회 쿼리 (서버 컴포넌트용)
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
 * 투표 목록 조회 함수
 */
export const getVotes = cache(async (
  status?: string,
  area?: string,
  options?: CacheOptions,
): Promise<Vote[]> => {
  console.log("[getVotes] 서버에서 투표 데이터 조회 시작:", { status, area });
  try {
    const client = await createClient();
    let query = client
      .from("vote")
      .select(DEFAULT_VOTE_QUERY);

    // 상태 필터링
    if (status) {
      const now = new Date();

      if (status === "upcoming") {
        query = query.gt("start_at", now.toISOString());
      } else if (status === "ongoing") {
        query = query
          .lte("start_at", now.toISOString())
          .gt("stop_at", now.toISOString());
      } else if (status === "completed") {
        query = query.lte("stop_at", now.toISOString());
      }
    }

    // 지역 필터링
    if (area) {
      query = query.eq("area", area);
    }

    // 공개된 투표만 조회
    query = query
      .lte("visible_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("order", { ascending: true });

    console.log("[getVotes] 쿼리 실행");
    const { data, error } = await query;

    if (error) {
      console.error("[getVotes] 에러 발생:", error);
      return [];
    }

    console.log(`[getVotes] 데이터 ${data?.length || 0}개 조회 성공`);

    // 데이터 변환: vote_item -> voteItem, Supabase 스네이크 케이스를 카멜 케이스로 변환
    const transformedData = data.map((vote) => {
      // console.log(`[getVotes] 투표 ${vote.id}의 투표 항목:`, vote.vote_item);
      const voteItems: VoteItem[] = vote.vote_item?.map((item) => ({
        id: item.id,
        voteId: item.vote_id,
        artistId: item.artist_id,
        groupId: item.group_id,
        voteTotal: item.vote_total,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        deletedAt: item.deleted_at,
        artist: item.artist,
      })) || [];

      // 최종 변환된 Vote 객체 생성
      const transformedVote: Vote & { voteItem?: VoteItem[] } = {
        id: vote.id,
        title: vote.title,
        area: vote.area,
        mainImage: vote.main_image,
        resultImage: vote.result_image,
        waitImage: vote.wait_image,
        order: vote.order,
        startAt: vote.start_at,
        stopAt: vote.stop_at,
        visibleAt: vote.visible_at,
        voteCategory: vote.vote_category,
        voteSubCategory: vote.vote_sub_category,
        voteContent: vote.vote_content,
        createdAt: vote.created_at,
        updatedAt: vote.updated_at,
        deletedAt: vote.deleted_at,
        voteItem: voteItems.length > 0 ? voteItems : undefined,
      };

      return transformedVote;
    });

    console.log(`[getVotes] 최종 변환된 데이터:`, {
      count: transformedData.length,
      firstItemHasVoteItems: transformedData[0]
        ? (transformedData[0].voteItem?.length || 0) > 0
        : false,
    });

    return transformedData;
  } catch (e) {
    console.error("[getVotes] 에러:", e);
    return [];
  }
});

/**
 * 단일 투표 조회 함수
 */
export const getVoteById = cache(async (
  id: string | number,
  options?: CacheOptions,
): Promise<Vote | null> => {
  console.log("[getVoteById] 서버에서 단일 투표 데이터 조회 시작:", { id });
  try {
    const client = await createClient();
    const { data, error } = await client
      .from("vote")
      .select(DEFAULT_VOTE_QUERY)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) {
      console.error("[getVoteById] 에러 발생:", error);
      return null;
    }

    if (!data) {
      console.log("[getVoteById] 해당 ID의 투표 없음:", id);
      return null;
    }

    console.log(`[getVoteById] 투표 ${id} 조회 성공`);

    // 데이터 변환: vote_item -> voteItem, Supabase 스네이크 케이스를 카멜 케이스로 변환
    const voteItems: VoteItem[] = data.vote_item?.map((item) => ({
      id: item.id,
      voteId: item.vote_id,
      artistId: item.artist_id,
      groupId: item.group_id,
      voteTotal: item.vote_total,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      deletedAt: item.deleted_at,
      artist: item.artist,
    })) || [];

    // 최종 변환된 Vote 객체 생성
    const transformedVote: Vote & { voteItem?: VoteItem[] } = {
      id: data.id,
      title: data.title,
      area: data.area,
      mainImage: data.main_image,
      resultImage: data.result_image,
      waitImage: data.wait_image,
      order: data.order,
      startAt: data.start_at,
      stopAt: data.stop_at,
      visibleAt: data.visible_at,
      voteCategory: data.vote_category,
      voteSubCategory: data.vote_sub_category,
      voteContent: data.vote_content,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
      voteItem: voteItems.length > 0 ? voteItems : undefined,
    };

    console.log(`[getVoteById] 변환된 데이터:`, {
      id: transformedVote.id,
      hasVoteItems: (transformedVote.voteItem?.length || 0) > 0,
      voteItemsCount: transformedVote.voteItem?.length || 0,
    });

    return transformedVote;
  } catch (e) {
    console.error("[getVoteById] 에러:", e);
    return null;
  }
});
