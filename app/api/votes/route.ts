import { NextRequest, NextResponse } from 'next/server';
import { createPublicSupabaseServerClient } from '@/lib/supabase/server';
import {
  VOTE_AREAS,
  VOTE_STATUS,
  normalizeVoteStatus,
  normalizeVoteArea,
} from '@/stores/voteFilterStore';
import { shouldOrderByArea } from '@/lib/vote/vote-order';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';

// 기본 투표 테이블 조회 쿼리 (서버/클라이언트 서비스와 동일 구조 유지)
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

type VoteOrderConfig = {
  column: 'start_at' | 'stop_at' | 'id';
  ascending: boolean;
};

const getVoteOrderConfig = (status: string): VoteOrderConfig => {
  switch (status) {
    case VOTE_STATUS.ONGOING:
      return { column: 'stop_at', ascending: true }; // 진행: 마감 임박순
    case VOTE_STATUS.UPCOMING:
      return { column: 'start_at', ascending: true }; // 예정: 오픈 임박순
    case VOTE_STATUS.COMPLETED:
      return { column: 'stop_at', ascending: false }; // 종료: 최신 마감순
    case VOTE_STATUS.ADMIN:
      // 앱 debug 는 finalSort='id', finalOrder='DESC' 다 (vote_list_provider.dart).
      return { column: 'id', ascending: false };
    default:
      return { column: 'start_at', ascending: false };
  }
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    // 신뢰 경계 — 알 수 없는 값은 기본값으로 좁힌다. 그대로 흘리면 status 는
    // 어느 case 에도 안 걸려 날짜 필터가 통째로 빠지고, area 는 빈 결과를 만든다.
    const statusParam: string = normalizeVoteStatus(url.searchParams.get('status'));
    const areaParam: string = normalizeVoteArea(url.searchParams.get('area'));
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '12', 10)));

    // 관리자 보호 처리
    const userContext = await getCurrentUserContext();
    const isAdmin = (userContext as any)?.isAdmin === true;
    const status = statusParam === VOTE_STATUS.ADMIN
      ? (isAdmin ? VOTE_STATUS.ADMIN : VOTE_STATUS.ONGOING)
      : statusParam;
    const area = areaParam;

    const client = createPublicSupabaseServerClient();

    const offset = (page - 1) * limit;
    const nowIso = new Date().toISOString();

    let query = client
      .from('vote')
      .select(DEFAULT_VOTE_QUERY, { count: 'exact' })
      .is('deleted_at', null);

    // visible_at 필터: admin 상태가 아니면 적용
    if (status !== VOTE_STATUS.ADMIN) {
      query = query.lte('visible_at', nowIso);
    }

    // 상태 필터: admin 은 상태 필터 미적용
    if (status && status !== VOTE_STATUS.ADMIN) {
      const now = nowIso;
      switch (status) {
        case VOTE_STATUS.UPCOMING:
          query = query.gt('start_at', now);
          break;
        case VOTE_STATUS.ONGOING:
          query = query.lte('start_at', now).gt('stop_at', now);
          break;
        case VOTE_STATUS.COMPLETED:
          query = query.lte('stop_at', now);
          break;
      }
    }

    // 지역 필터 - areas 배열에 해당 값이 포함되어 있는지 확인
    if (area && area !== VOTE_AREAS.ALL) {
      query = query.contains('areas', [area]);
    }

    // 정렬 + 페이지네이션
    const { column, ascending } = getVoteOrderConfig(status);
    // 앱과 동일하게 관리자 목록의 전체 탭에서만 area 로 먼저 묶는다 (shouldOrderByArea 참고).
    if (shouldOrderByArea(status, area)) {
      query = query.order('area', { ascending: true });
    }
    query = query
      .order(column, { ascending })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const isOngoingOrCompleted =
      status === VOTE_STATUS.ONGOING || status === VOTE_STATUS.COMPLETED;
    const isUpcoming = status === VOTE_STATUS.UPCOMING;

    const MAX_TOP_ITEMS = 3;
    const MAX_UPCOMING_ITEMS = 24;

    // 서버에서 사용하는 형태로 필드명 보정 + 상위 득표 아이템만 유지
    const normalized = (data || []).map((v: any) => {
      const rawItems = Array.isArray(v?.vote_item)
        ? v.vote_item.filter((item: any) => !item?.deleted_at)
        : [];

      const sortedItems = [...rawItems].sort(
        (a, b) => (b?.vote_total ?? 0) - (a?.vote_total ?? 0),
      );

      let limitedItems = sortedItems;

      if (isOngoingOrCompleted) {
        limitedItems = sortedItems.slice(0, MAX_TOP_ITEMS);
      } else if (isUpcoming) {
        limitedItems = sortedItems.slice(0, MAX_UPCOMING_ITEMS);
      }

      return {
        ...v,
        vote_item: limitedItems,
        vote_reward: Array.isArray(v?.vote_reward) ? v.vote_reward : [],
        voteItem: limitedItems,
        voteReward: Array.isArray(v?.vote_reward) ? v.vote_reward : [],
      };
    });

    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const hasMore = page < totalPages;

    return NextResponse.json({
      data: normalized,
      count: totalCount,
      totalPages,
      hasMore,
      page,
      limit,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


