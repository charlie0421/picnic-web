import { NextResponse, NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    const supabase = await createSupabaseServerClient();

    // vote 단건 (소프트삭제 제외)
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('*')
      .eq('id', voteId)
      .is('deleted_at', null)
      .single();

    if (voteError || !vote) {
      return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
    }

    // vote_item 목록 (소프트삭제 제외) + 아티스트/그룹 조인
    const { data: items, error: itemsError } = await supabase
      .from('vote_item')
      .select(`
        *,
        artist:artist_id (
          *,
          artistGroup:group_id (*)
        )
      `)
      .eq('vote_id', voteId)
      .is('deleted_at', null);

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to fetch vote items' }, { status: 500 });
    }

    // rewards (vote_reward -> reward) 소프트삭제 제외
    const { data: vr, error: vrError } = await supabase
      .from('vote_reward')
      .select('reward_id')
      .eq('vote_id', voteId);

    if (vrError) {
      return NextResponse.json({ error: 'Failed to fetch vote rewards' }, { status: 500 });
    }

    let rewards: any[] = [];
    if (vr && vr.length > 0) {
      const rewardIds = vr.map((r: any) => r.reward_id);
      const { data: rewardRows, error: rewardError } = await supabase
        .from('reward')
        .select('*')
        .in('id', rewardIds)
        .is('deleted_at', null);
      if (rewardError) {
        return NextResponse.json({ error: 'Failed to fetch rewards' }, { status: 500 });
      }
      rewards = rewardRows || [];
    }

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
      notModified.headers.set('Cache-Control', 'no-cache');
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
    // 검증 기반 캐시: 매 요청 재검증(304 유도)
    res.headers.set('Cache-Control', 'no-cache');
    res.headers.set('ETag', etag);
    if (latestItemUpdatedAt) res.headers.set('Last-Modified', new Date(latestItemUpdatedAt).toUTCString());
    return res;
  } catch (e) {
    console.error('[GET /api/vote/[id]/detail] Unexpected error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


