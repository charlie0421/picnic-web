import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { Banner, Media, Reward, Popup } from "@/types/interfaces";
import { withRetry } from "./retry-utils";
import {
  FALLBACK_REWARDS,
  GET_REWARDS_TIMEOUT_MS,
  DEFAULT_REWARD_LIMIT,
  REWARD_SELECT_COLUMNS,
  withTimeout,
  withDeadline,
  logRequestError,
} from "./queries-helpers";

type ContentQueryOptions = {
  throwOnError?: boolean;
};

// 리워드 데이터 가져오기
// throwOnError: 샘플 리워드(FALLBACK_REWARDS)로 대체하지 않는다. ISR 페이지는 이 옵션을 써야 한다 —
// 샘플을 렌더하면 그 화면이 캐시에 저장돼 정상 목록을 덮는다.
//   - 조회 실패·타임아웃 → 예외로 전파 (Next 가 마지막 정상 페이지를 유지)
//   - 결과가 실제로 비어 있음 → [] (호출자가 빈 상태를 렌더)
//   - 시간 예산을 넘기면 진행 중인 요청을 끊고 더 재시도하지 않는다 (withDeadline)
// 이 함수는 안에 재시도(3회)와 시간 예산(7초)을 이미 갖고 있다. throwOnError 로 부를 때는
// queries.ts 의 getRewards(withRetry 로 한 번 더 감쌈)를 쓰지 말 것 — 예외가 바깥 재시도를 돌려
// 장애 시 최악 약 30초·쿼리 12회가 된다.
export const _getRewards = async (
  limit?: number,
  { throwOnError = false }: ContentQueryOptions = {},
): Promise<Reward[]> => {
  // throwOnError 경로의 시간 예산(withDeadline)이 넘겨주는 신호. 예산을 넘기면 조회를 끊는다.
  let deadlineSignal: AbortSignal | undefined;

  const fetchRewards = withRetry(
    async (limitParam?: number): Promise<Reward[]> => {
      const supabase = createPublicSupabaseClient();
      const effectiveLimit = limitParam ?? DEFAULT_REWARD_LIMIT;

      // count 를 요청하지 않는다. 쓰는 곳이 없고, 요청하면 limit 에 잘린 결과에 PostgREST 가 206 을 돌려준다.
      // Next 는 상태 200 인 응답만 빌드의 fetch 캐시에 넣으므로 206 이면 언어별 페이지가 같은 요청을 따로 보낸다.
      let query = supabase
        .from("reward")
        .select(REWARD_SELECT_COLUMNS)
        .is("deleted_at", null)
        .order("order", { ascending: true });

      if (deadlineSignal) {
        query = query.abortSignal(deadlineSignal);
      }
      query = query.limit(effectiveLimit);

      const { data: rewardData, error: rewardError } = await query;

      if (rewardError) {
        throw rewardError;
      }

      if (!rewardData || rewardData.length === 0) {
        return throwOnError ? [] : FALLBACK_REWARDS;
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
      // 시간 예산을 넘겨 끊은 요청은 다시 보내지 않는다.
      shouldRetry: () => !deadlineSignal?.aborted,
      onRetry: (error, attempt) => {
        console.warn(`[getRewards] Retry attempt ${attempt} due to error:`, error?.message ?? error);
      },
    }
  );

  if (throwOnError) {
    try {
      return await withDeadline(
        (signal) => {
          deadlineSignal = signal;
          return fetchRewards(limit);
        },
        'getRewards',
        GET_REWARDS_TIMEOUT_MS,
      );
    } catch (error) {
      logRequestError(error, 'getRewards');
      throw error;
    }
  }

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

type BannerQueryOptions = ContentQueryOptions & {
  columns?: string;
};

// 배너 데이터 가져오기
export const _getBanners = async ({
  columns,
  throwOnError = false,
}: BannerQueryOptions = {}): Promise<Banner[]> => {
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
    if (throwOnError) throw error;
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

    // reward.id 는 number 다. 이 함수는 문자열 id 를 받으므로 여기서 좁힌다.
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      console.error('[_getRewardById] 유효하지 않은 ID:', id);
      return null;
    }

    const supabase = createPublicSupabaseClient();

    const { data: rewardData, error: rewardError } = await supabase
      .from("reward")
      .select("*")
      .eq("id", numericId)
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
export const _getPopups = async ({
  throwOnError = false,
}: ContentQueryOptions = {}): Promise<Popup[]> => {
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
    if (throwOnError) throw error;
    return [];
  }
};

// Public routes must distinguish a real empty result from a query failure so
// failures can return a non-cacheable fallback. Keep their retry budget below
// the default wrapper used by other callers to avoid amplifying DB outages.
export const getBannersForRoute = withRetry(
  () => _getBanners({ throwOnError: true }),
  { maxRetries: 1 },
);

export const getPopupsForRoute = withRetry(
  () => _getPopups({ throwOnError: true }),
  { maxRetries: 1 },
);
