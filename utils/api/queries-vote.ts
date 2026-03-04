import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { Vote, VoteItem, Reward } from "@/types/interfaces";
import { FALLBACK_VOTES, withTimeout, logRequestError } from "./queries-helpers";

// 투표 데이터 가져오기
export const _getVotes = async (
  sortBy: "votes" | "recent" = "votes",
): Promise<Vote[]> => {
  const supabaseFetch = (async () => {
    try {
      const supabase = createPublicSupabaseClient();
      const { data: voteData, error: voteError } = await supabase
        .from("vote")
        .select(`
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
        `)
        .is("deleted_at", null)
        .order("start_at", { ascending: false });

      if (voteError) throw voteError;
      if (!voteData || voteData.length === 0) return FALLBACK_VOTES;

      return voteData.map((vote) => ({
        ...vote,
        deletedAt: vote.deleted_at,
        startAt: vote.start_at,
        stopAt: vote.stop_at,
        createdAt: vote.created_at,
        updatedAt: vote.updated_at,
        mainImage: vote.main_image,
        resultImage: vote.result_image,
        waitImage: vote.wait_image,
        voteCategory: vote.vote_category,
        voteContent: vote.vote_content,
        voteSubCategory: vote.vote_sub_category,
        visibleAt: vote.visible_at,
        voteItems: vote.vote_item
          ? vote.vote_item.map((item) => ({
            ...item,
            deletedAt: item.deleted_at,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            voteId: item.vote_id,
            artistId: item.artist_id,
            groupId: item.group_id,
            voteTotal: item.vote_total || 0,
            artist: item.artist
              ? {
                ...item.artist,
                image: item.artist.image,
              }
              : null,
          }))
          : [],
        rewards: vote.vote_reward
          ? vote.vote_reward.map((vr) => vr.reward).filter(Boolean)
          : [],
        title: vote.title || "제목 없음",
      }));
    } catch (error) {
      logRequestError(error, 'getVotes');
      return FALLBACK_VOTES;
    }
  })();

  return withTimeout(supabaseFetch, FALLBACK_VOTES, 'getVotes');
};

// 투표 상세 정보 가져오기
export const _getVoteById = async (id: number): Promise<Vote | null> => {
  try {
    const supabase = createPublicSupabaseClient();
    const { data: voteData, error: voteError } = await supabase
      .from("vote")
      .select(`
        *
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (voteError) throw voteError;
    if (!voteData) return null;

    return {
      ...voteData,
      deletedAt: voteData.deleted_at,
      startAt: voteData.start_at,
      stopAt: voteData.stop_at,
      createdAt: voteData.created_at,
      updatedAt: voteData.updated_at,
      mainImage: voteData.main_image,
      resultImage: voteData.result_image,
      waitImage: voteData.wait_image,
      voteCategory: voteData.vote_category,
      voteContent: voteData.vote_content,
      voteSubCategory: voteData.vote_sub_category,
      visibleAt: voteData.visible_at,
      title: voteData.title || "제목 없음",
    };
  } catch (error) {
    logRequestError(error, 'getVoteById');
    return null;
  }
};

// 투표 항목 데이터 가져오기
export const _getVoteItems = async (voteId: number): Promise<VoteItem[]> => {
  try {
    const supabase = createPublicSupabaseClient();
    const { data: voteItemsData, error: voteItemsError } = await supabase
      .from("vote_item")
      .select(`
        *,
        artist (
          *,
          artist_group (
            *
          )
        )
      `)
      .eq("vote_id", voteId)
      .is("deleted_at", null);

    if (voteItemsError) throw voteItemsError;
    if (!voteItemsData || voteItemsData.length === 0) return [];

    return voteItemsData.map((item) => ({
      ...item,
      deletedAt: item.deleted_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      voteId: item.vote_id,
      artistId: item.artist_id,
      groupId: item.group_id,
      voteTotal: item.vote_total,
      artist: item.artist,
    }));
  } catch (error) {
    logRequestError(error, 'getVoteItems');
    return [];
  }
};

// 투표 보상 데이터 가져오기
export const _getVoteRewards = async (voteId: number): Promise<Reward[]> => {
  try {
    const supabase = createPublicSupabaseClient();
    const { data: voteRewardData, error: voteRewardError } = await supabase
      .from("vote_reward")
      .select(`
        reward_id
      `)
      .eq("vote_id", voteId);

    if (voteRewardError) throw voteRewardError;
    if (!voteRewardData || voteRewardData.length === 0) return [];

    const rewardIds = voteRewardData.map((vr) => vr.reward_id);

    const { data: rewardData, error: rewardError } = await supabase
      .from("reward")
      .select("*")
      .in("id", rewardIds)
      .is("deleted_at", null);

    if (rewardError) throw rewardError;
    if (!rewardData || rewardData.length === 0) return [];

    return rewardData.map((reward: any) => ({
      ...reward,
      deletedAt: reward.deleted_at,
      createdAt: reward.created_at,
      updatedAt: reward.updated_at,
      locationImages: reward.location_images,
      overviewImages: reward.overview_images,
      sizeGuide: reward.size_guide,
      sizeGuideImages: reward.size_guide_images,
    }));
  } catch (error) {
    logRequestError(error, 'getVoteRewards');
    return [];
  }
};
