import {Banner, Media, Reward, Vote, VoteItem, Popup} from "@/types/interfaces";
import {withRetry} from "./retry-utils";
import { createClient } from "../supabase-server-client";

// 서버 환경인지 여부 확인
const isServer = typeof window === 'undefined';

// 동적으로 클라이언트 가져오기
const getSupabaseClient = async () => {
  if (isServer) {
    // 서버 환경에서는 서버 클라이언트 사용
    try {
      return await createClient();
    } catch (error) {
      console.error('서버 Supabase 클라이언트 생성 오류:', error);
      throw new Error('서버 Supabase 클라이언트를 생성할 수 없습니다.');
    }
  } else {
    // 클라이언트 환경에서는 클라이언트 측 Supabase 사용
    try {
      const { supabase } = await import('../supabase-client');
      return supabase;
    } catch (error) {
      console.error('클라이언트 Supabase 가져오기 오류:', error);
      throw new Error('클라이언트 Supabase를 가져올 수 없습니다.');
    }
  }
};

// API 요청 실패 로깅 및 디버깅을 위한 함수
const logRequestError = (error: any, functionName: string) => {
  console.error(`[API 오류] ${functionName}:`, error);

  // 환경 정보 추가 (브라우저에서만 실행)
  if (typeof window !== 'undefined') {
    console.error('요청 환경:', {
      url: window.location.href,
      hostname: window.location.hostname,
      isProduction: process.env.NODE_ENV === 'production'
    });
  }

  return error;
};

// 투표 데이터 가져오기
const _getVotes = async (
  sortBy: "votes" | "recent" = "votes",
): Promise<Vote[]> => {
  try {
    const supabase = await getSupabaseClient();
    const now = new Date();
    const currentTime = now.toISOString();

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
    if (!voteData || voteData.length === 0) return [];

    return voteData.map((vote: any) => ({
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
        ? vote.vote_item.map((item: any) => ({
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
        ? vote.vote_reward.map((vr: any) => vr.reward).filter(Boolean)
        : [],
      title: vote.title || "제목 없음",
    }));
  } catch (error) {
    logRequestError(error, 'getVotes');
    return [];
  }
};

// 리워드 데이터 가져오기
const _getRewards = async (limit?: number): Promise<Reward[]> => {
  try {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from("reward")
      .select("*")
      .is("deleted_at", null)
      .order("order", { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data: rewardData, error: rewardError } = await query;

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
    logRequestError(error, 'getRewards');
    return [];
  }
};

// 배너 데이터 가져오기
const _getBanners = async (): Promise<Banner[]> => {
  try {
    const supabase = await getSupabaseClient();
    
    const { data: bannerData, error: bannerError } = await supabase
      .from("banner")
      .select("*")
      .is("deleted_at", null)
      .eq("location", "vote_home")
      .order("order", { ascending: true })
      .lte("start_at", 'now()')
      .or('end_at.is.null,end_at.gt.now()');

    if (bannerError) {
      console.error('[getBanners] Supabase 오류:', bannerError);
      throw bannerError;
    }
    
    if (!bannerData || bannerData.length === 0) {
      console.log('[getBanners] 조회된 배너 데이터가 없습니다.');
      return [];
    }
    
    return bannerData;
  } catch (error) {
    console.error('[getBanners] 오류 발생:', error);
    logRequestError(error, 'getBanners');
    return [];
  }
};

// 리워드 상세 정보 가져오기
const _getRewardById = async (id: string): Promise<Reward | null> => {
  try {
    const supabase = await getSupabaseClient();
    const { data: rewardData, error: rewardError } = await supabase
      .from("reward")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (rewardError) throw rewardError;
    if (!rewardData) return null;

    return rewardData;
  } catch (error) {
    logRequestError(error, 'getRewardById');
    return null;
  }
};

// 미디어 데이터 가져오기
const _getMedias = async (): Promise<Media[]> => {
  try {
    const supabase = await getSupabaseClient();
    const { data: mediaData, error: mediaError } = await supabase
      .from("media")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (mediaError) throw mediaError;
    if (!mediaData || mediaData.length === 0) return [];

    // 스네이크 케이스에서 캐멀 케이스로 필드 변환
    return mediaData.map((media: any) => ({
      id: media.id,
      created_at: media.created_at,
      updated_at: media.updated_at,
      deleted_at: media.deleted_at,
      thumbnail_url: media.thumbnail_url,
      video_url: media.video_url,
      video_id: media.video_id,
      title: media.title,
    }));
  } catch (error) {
    logRequestError(error, 'getMedias');
    return [];
  }
};

// 투표 상세 정보 가져오기
const _getVoteById = async (id: number): Promise<Vote | null> => {
  try {
    const supabase = await getSupabaseClient();
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
const _getVoteItems = async (voteId: number): Promise<VoteItem[]> => {
  try {
    const supabase = await getSupabaseClient();
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

    return voteItemsData.map((item: any) => ({
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
const _getVoteRewards = async (voteId: number): Promise<Reward[]> => {
  try {
    const supabase = await getSupabaseClient();
    const { data: voteRewardData, error: voteRewardError } = await supabase
      .from("vote_reward")
      .select(`
        reward_id
      `)
      .eq("vote_id", voteId);

    if (voteRewardError) throw voteRewardError;
    if (!voteRewardData || voteRewardData.length === 0) return [];

    const rewardIds = voteRewardData.map((vr: any) => vr.reward_id);

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

// 팝업 데이터 가져오기
const _getPopups = async (): Promise<Popup[]> => {
  try {
    const supabase = await getSupabaseClient();
    const { data: popupData, error: popupError } = await supabase
      .from("popup")
      .select("*")
      .is("deleted_at", null)
      .order("start_at", { ascending: false });

    if (popupError) throw popupError;
    if (!popupData || popupData.length === 0) return [];

    return popupData.map((popup: any) => ({
      ...popup,
      createdAt: popup.created_at,
      updatedAt: popup.updated_at,
      deletedAt: popup.deleted_at,
      startAt: popup.start_at,
      stopAt: popup.stop_at,
      image: popup.image,
      content: popup.content,
      platform: popup.platform,
      title: popup.title,
    }));
  } catch (error) {
    logRequestError(error, 'getPopups');
    return [];
  }
};

// 재시도 메커니즘이 적용된 내보내기 함수
export const getVotes = withRetry(_getVotes);
export const getRewards = withRetry(_getRewards);
export const getBanners = withRetry(_getBanners);
export const getRewardById = withRetry(_getRewardById);
export const getMedias = withRetry(_getMedias);
export const getVoteById = withRetry(_getVoteById);
export const getVoteItems = withRetry(_getVoteItems);
export const getVoteRewards = withRetry(_getVoteRewards);
export const getPopups = withRetry(_getPopups);
