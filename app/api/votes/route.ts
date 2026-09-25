import { NextRequest, NextResponse } from 'next/server';
import { createPublicSupabaseServerClient } from '@/lib/supabase/server';
import {
  VOTE_STATUS,
  normalizeVoteStatus,
  normalizeVoteArea,
} from '@/stores/voteFilterStore';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';
import { buildVoteQuery } from '@/lib/data-fetching/server/vote-service-query';

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
    // 신뢰 경계 — 알 수 없는 값은 기본값으로 좁힌다. 그대로 흘리면 status 는
    // 어느 case 에도 안 걸려 날짜 필터가 통째로 빠지고, area 는 빈 결과를 만든다.
    const statusParam: string = normalizeVoteStatus(url.searchParams.get('status'));
    const areaParam: string = normalizeVoteArea(url.searchParams.get('area'));
    const rawPage = url.searchParams.get('page');
    const rawLimit = url.searchParams.get('limit');
    const page = rawPage === null ? 1 : Number(rawPage);
    const limit = rawLimit === null ? 12 : Number(rawLimit);

    if (
      !Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50
    ) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 },
      );
    }

    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(offset + limit - 1)) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 },
      );
    }

    // 관리자 보호 처리
    const userContext = statusParam === VOTE_STATUS.ADMIN
      ? await getCurrentUserContext()
      : null;
    const isAdmin = userContext?.isAdmin === true;
    const status = statusParam === VOTE_STATUS.ADMIN
      ? (isAdmin ? VOTE_STATUS.ADMIN : VOTE_STATUS.ONGOING)
      : statusParam;
    const area = areaParam;

    const client = createPublicSupabaseServerClient();

    // 공통 빌더의 vote_total DESC NULLS LAST + referenced-table limit 계약을
    // 그대로 재사용하되, 기존 API 응답 컬럼과 exact count는 유지한다.
    const query = buildVoteQuery(client, status, area)
      .select(DEFAULT_VOTE_QUERY)
      .setHeader('Prefer', 'count=exact')
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
