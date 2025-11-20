import { NextRequest, NextResponse } from 'next/server';
import { createPublicSupabaseServerClient } from '@/lib/supabase/server';
import { VOTE_AREAS, VOTE_STATUS } from '@/stores/voteFilterStore';
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const statusParam = (url.searchParams.get('status') || VOTE_STATUS.ONGOING) as string;
    const areaParam = (url.searchParams.get('area') || VOTE_AREAS.ALL) as string;
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

    // 지역 필터
    if (area && area !== VOTE_AREAS.ALL) {
      query = query.eq('area', area);
    }

    // 정렬 + 페이지네이션
    query = query
      .order('start_at', { ascending: false })
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


