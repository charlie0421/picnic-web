import { NextResponse, NextRequest } from 'next/server';
import { createHash } from 'crypto';
import {
  createPublicSupabaseServerClient,
  createSupabaseServerClient,
} from '@/lib/supabase/server';
import { getCurrentUserContext } from '@/lib/data-fetching/server/supabase-service';

export const dynamic = 'force-dynamic';

const VOTE_COLUMNS = `
  area,
  areas,
  created_at,
  deleted_at,
  id,
  is_partnership,
  main_image,
  order,
  partner,
  result_image,
  star_candy_bonus_total,
  star_candy_total,
  start_at,
  stop_at,
  title,
  updated_at,
  visible_at,
  vote_category,
  vote_content,
  vote_sub_category,
  vote_total,
  wait_image
`;

const VOTE_ITEM_COLUMNS = `
  artist_id,
  created_at,
  deleted_at,
  group_id,
  id,
  star_candy_bonus_total,
  star_candy_total,
  updated_at,
  vote_id,
  vote_total,
  artist:artist_id (
    birth_date,
    created_at,
    dd,
    debut_date,
    debut_dd,
    debut_mm,
    debut_yy,
    deleted_at,
    gender,
    group_id,
    id,
    image,
    is_kpop,
    is_musical,
    is_partnership,
    is_solo,
    mm,
    name,
    partner,
    partner_data,
    updated_at,
    yy,
    artistGroup:group_id (
      created_at,
      debut_date,
      debut_dd,
      debut_mm,
      debut_yy,
      deleted_at,
      id,
      image,
      name,
      updated_at
    )
  )
`;

const VOTE_REWARD_COLUMNS = `
  reward_id,
  reward:reward_id (
    created_at,
    deleted_at,
    id,
    location,
    location_images,
    order,
    overview_images,
    size_guide,
    size_guide_images,
    thumbnail,
    title,
    updated_at
  )
`;

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=2, stale-while-revalidate=5';
const PRIVATE_CACHE_CONTROL = 'private, no-cache';
const POSTGREST_NOT_FOUND = 'PGRST116';

const isNotFoundError = (error: unknown) =>
  (error as { code?: string } | null)?.code === POSTGREST_NOT_FOUND;

export async function GET(request: NextRequest, context: { params: Promise<{ id?: string }> }) {
  try {
    // 안전하게 voteId 파싱 ([id]/detail 구조이므로 마지막이 detail)
    const path = request.nextUrl.pathname;
    const segments = path.split('/').filter(Boolean);
    const idFromPath = segments.length >= 3 ? segments[segments.length - 2] : undefined;
    const awaitedParams = await context.params;
    const rawId = awaitedParams?.id || idFromPath;

    if (!rawId || isNaN(Number(rawId))) {
      return NextResponse.json({ error: 'Invalid vote id' }, { status: 400 });
    }

    const voteId = Number(rawId);
    const publicSupabase = createPublicSupabaseServerClient();
    const publicVoteResult = await publicSupabase
      .from('vote')
      .select(VOTE_COLUMNS)
      .eq('id', voteId)
      .is('deleted_at', null)
      .lte('visible_at', new Date().toISOString())
      .single();

    let supabase = publicSupabase;
    let vote = publicVoteResult.data;
    let isAdmin = false;

    if (publicVoteResult.error || !vote) {
      if (publicVoteResult.error && !isNotFoundError(publicVoteResult.error)) {
        console.error(
          '[GET /api/vote/[id]/detail] Public vote query failed:',
          publicVoteResult.error,
        );
        return NextResponse.json({ error: 'Failed to fetch vote' }, { status: 500 });
      }

      const userContext = await getCurrentUserContext();
      if (userContext.isAdmin !== true) {
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
      }

      isAdmin = true;
      supabase = await createSupabaseServerClient();
      const privateVoteResult = await supabase
        .from('vote')
        .select(VOTE_COLUMNS)
        .eq('id', voteId)
        .is('deleted_at', null)
        .single();

      if (privateVoteResult.error || !privateVoteResult.data) {
        if (privateVoteResult.error && !isNotFoundError(privateVoteResult.error)) {
          console.error(
            '[GET /api/vote/[id]/detail] Private vote query failed:',
            privateVoteResult.error,
          );
          return NextResponse.json({ error: 'Failed to fetch vote' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
      }

      vote = privateVoteResult.data;
    }

    const cacheControl = isAdmin ? PRIVATE_CACHE_CONTROL : PUBLIC_CACHE_CONTROL;

    const [itemsResult, voteRewardsResult] = await Promise.all([
      supabase
        .from('vote_item')
        .select(VOTE_ITEM_COLUMNS)
        .eq('vote_id', voteId)
        .is('deleted_at', null),
      supabase
        .from('vote_reward')
        .select(VOTE_REWARD_COLUMNS)
        .eq('vote_id', voteId)
        .is('reward.deleted_at', null),
    ]);

    const { data: items, error: itemsError } = itemsResult;

    if (itemsError) {
      console.error('[GET /api/vote/[id]/detail] Vote item query failed:', itemsError);
      return NextResponse.json({ error: 'Failed to fetch vote items' }, { status: 500 });
    }

    const { data: voteRewards, error: voteRewardsError } = voteRewardsResult;
    if (voteRewardsError) {
      console.error(
        '[GET /api/vote/[id]/detail] Vote reward query failed:',
        voteRewardsError,
      );
      return NextResponse.json({ error: 'Failed to fetch vote rewards' }, { status: 500 });
    }

    const rewards = (voteRewards || []).flatMap((row: any) => {
      if (Array.isArray(row?.reward)) return row.reward;
      return row?.reward ? [row.reward] : [];
    });

    // ETag/Last-Modified 계산
    const latestItemUpdatedAt = (items || [])
      .map((i: any) => i.updated_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || vote.updated_at || vote.created_at;
    const signatureSource = JSON.stringify({
      v: vote.updated_at || vote.created_at,
      items: (items || []).map((i: any) => ({ id: i.id, vt: i.vote_total, ua: i.updated_at, da: i.deleted_at })),
    });
    const etag = 'W/"' + createHash('sha1').update(signatureSource).digest('hex') + '"';

    // 조건부 요청 처리
    const ifNoneMatch = request.headers.get('if-none-match');
    const ifModifiedSince = request.headers.get('if-modified-since');
    if (ifNoneMatch === etag || (ifModifiedSince && latestItemUpdatedAt && new Date(ifModifiedSince) >= new Date(latestItemUpdatedAt))) {
      const notModified = new NextResponse(null, { status: 304 });
      notModified.headers.set('ETag', etag);
      if (latestItemUpdatedAt) notModified.headers.set('Last-Modified', new Date(latestItemUpdatedAt).toUTCString());
      notModified.headers.set('Cache-Control', cacheControl);
      return notModified;
    }

    // 응답 페이로드 (vote 객체에 vote_item 포함)
    const payload = {
      vote: {
        ...vote,
        vote_item: items || [],
      },
      rewards,
    };

    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set('Cache-Control', cacheControl);
    res.headers.set('ETag', etag);
    if (latestItemUpdatedAt) res.headers.set('Last-Modified', new Date(latestItemUpdatedAt).toUTCString());
    return res;
  } catch (e) {
    console.error('[GET /api/vote/[id]/detail] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
