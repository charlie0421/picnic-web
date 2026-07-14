import 'server-only';

import { VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore';
import { Vote, VoteItem, VoteReward } from '@/types/interfaces';
import { SupabaseClient } from '@supabase/supabase-js';

export type VoteWithRelations = Vote & {
  voteItem: VoteItem[];
  vote_item?: VoteItem[];
  voteReward: VoteReward[];
  vote_reward?: VoteReward[];
};

export const VOTE_LIST_SELECT = `
  id,
  title,
  main_image,
  start_at,
  stop_at,
  updated_at,
  vote_category,
  vote_sub_category,
  is_partnership,
  visible_at,
  vote_item (
    id,
    vote_total,
    updated_at,
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
    reward (
      id,
      title,
      thumbnail
    )
  )
`;

export const VOTE_DETAIL_SELECT = `
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
export function transformVoteData(data: any[]): VoteWithRelations[] {
  return data.map((vote) => {
    const voteItem: VoteItem[] = (vote.vote_item || [])
      .filter((item: any) => !item?.deleted_at)
      .map((item: any) => ({
        ...item,
        artist: item.artist
          ? {
              id: item.artist.id,
              name: item.artist.name,
              image: item.artist.image,
              artistGroup: item.artist.artist_group,
            }
          : null,
      }))
      .sort((a: any, b: any) => (b?.vote_total ?? 0) - (a?.vote_total ?? 0));

    const voteReward: VoteReward[] = vote.vote_reward?.map((vr: any) => ({
      ...vr,
      reward: vr.reward
        ? {
            id: vr.reward.id,
            title: vr.reward.title,
            thumbnail: vr.reward.thumbnail,
          }
        : null,
    })) || [];

    const { vote_item, vote_reward, ...rest } = vote;

    return {
      ...rest,
      vote_item: voteItem,
      voteItem,
      vote_reward: voteReward,
      voteReward,
    };
  });
}

/**
 * 공통 투표 쿼리 빌더
 */
type VoteOrderConfig = {
  column: 'start_at' | 'stop_at';
  ascending: boolean;
};

export const getVoteOrderConfig = (status?: string): VoteOrderConfig => {
  switch (status) {
    case VOTE_STATUS.ONGOING:
      return { column: 'stop_at', ascending: true }; // 진행: 마감 임박순
    case VOTE_STATUS.UPCOMING:
      return { column: 'start_at', ascending: true }; // 예정: 오픈 임박순
    case VOTE_STATUS.COMPLETED:
      return { column: 'stop_at', ascending: false }; // 종료: 최신 마감순
    default:
      return { column: 'start_at', ascending: false };
  }
};

export function buildVoteQuery(
  client: SupabaseClient,
  status?: string,
  area?: string,
) {
  const voteItemLimit =
    status === VOTE_STATUS.ADMIN
      ? undefined
      : status === VOTE_STATUS.ONGOING || status === VOTE_STATUS.COMPLETED
        ? 3
        : status === VOTE_STATUS.UPCOMING
          ? 24
          : undefined;

  let query = client
    .from("vote")
    .select(VOTE_LIST_SELECT)
    .is("deleted_at", null);

  // visible_at 필터: 관리자(admin) 상태가 아닌 경우에만 적용
  const nowIso = new Date().toISOString();
  if (status !== VOTE_STATUS.ADMIN) {
    query = query.lte("visible_at", nowIso);
  }

  // 상태 필터링 (admin일 때는 상태 필터 자체를 적용하지 않음)
  if (status && status !== VOTE_STATUS.ADMIN) {
    const now = nowIso;
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

  // 지역/타입 필터링 - 'all'인 경우 필터링하지 않음
  if (area && area !== VOTE_AREAS.ALL) {
    // 모든 area 탭(pic-chart 포함) — areas 배열에 값 포함 여부로 필터
    query = query.contains("areas", [area]);
  }

  const { column, ascending } = getVoteOrderConfig(status);

  query = query
    .is("vote_item.deleted_at", null)
    .order(column, { ascending })
    .order("vote_total", { ascending: false, referencedTable: "vote_item" });

  if (typeof voteItemLimit === 'number') {
    const normalizedLimit = Math.max(1, voteItemLimit);
    query = query
      .limit(normalizedLimit, { referencedTable: "vote_item" });
  }

  return query;
}
