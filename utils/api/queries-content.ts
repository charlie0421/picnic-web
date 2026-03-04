import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { Banner, Media, Reward, Popup } from "@/types/interfaces";
import { withRetry } from "./retry-utils";
import {
  FALLBACK_REWARDS,
  GET_REWARDS_TIMEOUT_MS,
  DEFAULT_REWARD_LIMIT,
  REWARD_SELECT_COLUMNS,
  withTimeout,
  logRequestError,
} from "./queries-helpers";

// 리워드 데이터 가져오기
export const _getRewards = async (limit?: number): Promise<Reward[]> => {
  const fetchRewards = withRetry(
    async (limitParam?: number): Promise<Reward[]> => {
      const supabase = createPublicSupabaseClient();
      const effectiveLimit = limitParam ?? DEFAULT_REWARD_LIMIT;

      let query = supabase
        .from("reward")
        .select(REWARD_SELECT_COLUMNS, { count: 'estimated' })
        .is("deleted_at", null)
        .order("order", { ascending: true });

      query = query.limit(effectiveLimit);

      const { data: rewardData, error: rewardError } = await query;

      if (rewardError) {
        throw rewardError;
      }

      if (!rewardData || rewardData.length === 0) {
        return FALLBACK_REWARDS;
      }

      return rewardData.map((reward) => ({
        ...reward,
        deletedAt: reward.deleted_at,
        createdAt: reward.created_at,
        updatedAt: reward.updated_at,
        locationImages: reward.location_images,
        overviewImages: reward.overview_images,
        sizeGuide: reward.size_guide,
        sizeGuideImages: reward.size_guide_images,
      }));
    },
    {
      maxRetries: 2,
      initialDelay: 300,
      maxDelay: 1500,
      onRetry: (error, attempt) => {
        console.warn(`[getRewards] Retry attempt ${attempt} due to error:`, error?.message ?? error);
      },
    }
  );

  const supabaseFetch = (async () => {
    try {
      return await fetchRewards(limit);
    } catch (error) {
      logRequestError(error, 'getRewards');
      return FALLBACK_REWARDS;
    }
  })();

  return withTimeout(supabaseFetch, FALLBACK_REWARDS, 'getRewards', GET_REWARDS_TIMEOUT_MS);
};

// 배너 데이터 가져오기
export const _getBanners = async ({ columns }: { columns?: string } = {}): Promise<Banner[]> => {
  try {
    const supabase = createPublicSupabaseClient();

    const { data: bannerData, error: bannerError } = await supabase
      .from("banner")
      .select(columns || "*")
      .is("deleted_at", null)
      .eq("location", "vote_home")
      .order("order", { ascending: true })
      .lte("start_at", 'now()')
      .or('end_at.is.null,end_at.gt.now()');

    if (bannerError) {
      console.error('[getBanners] Supabase 오류:', bannerError);
      throw bannerError;
    }

    if (!bannerData || (Array.isArray(bannerData) && bannerData.length === 0)) {
      return [];
    }

    return (bannerData as unknown as Banner[]) ?? [];
  } catch (error) {
    console.error('[getBanners] 오류 발생:', error);
    logRequestError(error, 'getBanners');
    return [];
  }
};

// 리워드 상세 정보 가져오기
export const _getRewardById = async (id: string): Promise<Reward | null> => {
  try {
    if (!id || id.trim() === '') {
      console.error('[_getRewardById] 유효하지 않은 ID:', id);
      return null;
    }

    const supabase = createPublicSupabaseClient();

    const { data: rewardData, error: rewardError } = await supabase
      .from("reward")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (rewardError) {
      console.error(`[_getRewardById] Supabase 쿼리 오류 (ID: ${id}):`, {
        error: rewardError,
        code: rewardError.code,
        message: rewardError.message,
        details: rewardError.details,
        hint: rewardError.hint
      });

      // PGRST116은 "no rows returned" 에러 (데이터가 없음)
      if (rewardError.code === 'PGRST116') {
        return null;
      }

      throw rewardError;
    }

    if (!rewardData) {
      return null;
    }

    return rewardData;
  } catch (error) {
    console.error(`[_getRewardById] 리워드 ID ${id} 조회 중 예외:`, {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      id
    });

    logRequestError(error, `getRewardById(${id})`);
    return null;
  }
};

// 미디어 데이터 가져오기
export const _getMedias = async (): Promise<Media[]> => {
  try {
    const supabase = createPublicSupabaseClient();
    const { data: mediaData, error: mediaError } = await supabase
      .from("media")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (mediaError) throw mediaError;
    if (!mediaData || mediaData.length === 0) return [];

    // 스네이크 케이스에서 캐멀 케이스로 필드 변환
    return mediaData.map((media) => ({
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

// 팝업 데이터 가져오기 (서버 시간 기준으로 활성 팝업만)
export const _getPopups = async (): Promise<Popup[]> => {
  try {
    const supabase = createPublicSupabaseClient();
    const { data: popupData, error: popupError } = await supabase
      .from("popup")
      .select("*")
      .is("deleted_at", null)
      .lte("start_at", 'now()') // 시작 시간이 현재 시간보다 이전이거나 같은 것
      .or('stop_at.is.null,stop_at.gte.now()') // 종료 시간이 null이거나 현재 시간보다 이후이거나 같은 것
      .order("start_at", { ascending: false });

    if (popupError) {
      console.error('[getPopups] Supabase 오류:', popupError);
      throw popupError;
    }

    if (!popupData || popupData.length === 0) {
      return [];
    }

    return popupData.map((popup) => ({
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
