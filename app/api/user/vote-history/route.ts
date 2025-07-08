import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    const supabase = await createServerSupabaseClient();

    // 투표 내역 조회 (최신순)
    const { data: voteHistory, error } = await supabase
      .from('vote_pick')
      .select(`
        id,
        vote_id,
        vote_item_id,
        amount,
        created_at,
        vote:vote_id (
          id,
          title,
          start_at,
          stop_at,
          main_image,
          area,
          vote_category
        ),
        vote_item:vote_item_id (
          id,
          artist_id,
          group_id,
          artist (
            id,
            name,
            image,
            artist_group (
              id,
              name
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('투표 내역 조회 실패:', error);
      return NextResponse.json({ error: '투표 내역 조회에 실패했습니다.' }, { status: 500 });
    }

    // 전체 투표 수 조회
    const { count: totalCount } = await supabase
      .from('vote_pick')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null);

    // 안전한 다국어 텍스트 처리 함수
    const safeMultiLangText = (text: any) => {
      if (!text) return '';
      if (typeof text === 'string') return text;
      if (typeof text === 'object' && text !== null) {
        // 이미 다국어 객체인 경우 그대로 반환
        if (text.en || text.ko) return text;
        // 예상치 못한 객체인 경우 문자열로 변환
        return JSON.stringify(text);
      }
      return String(text);
    };

    // 데이터 변환 (안전성 강화)
    const transformedHistory = voteHistory?.map(item => ({
      id: item.id,
      voteId: item.vote_id,
      voteItemId: item.vote_item_id,
      amount: item.amount,
      createdAt: item.created_at,
      vote: item.vote ? {
        id: item.vote.id,
        title: safeMultiLangText(item.vote.title),
        startAt: item.vote.start_at,
        stopAt: item.vote.stop_at,
        mainImage: item.vote.main_image,
        area: item.vote.area || '',
        voteCategory: safeMultiLangText(item.vote.vote_category)
      } : null,
      voteItem: item.vote_item ? {
        id: item.vote_item.id,
        artistId: item.vote_item.artist_id,
        groupId: item.vote_item.group_id,
        artist: item.vote_item.artist ? {
          id: item.vote_item.artist.id,
          name: safeMultiLangText(item.vote_item.artist.name),
          image: item.vote_item.artist.image,
          artistGroup: item.vote_item.artist.artist_group ? {
            id: item.vote_item.artist.artist_group.id,
            name: safeMultiLangText(item.vote_item.artist.artist_group.name)
          } : null
        } : null
      } : null
    })) || [];

    return NextResponse.json({
      success: true,
      data: transformedHistory,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        hasNext: offset + limit < (totalCount || 0)
      }
    });

  } catch (error) {
    console.error('투표 내역 API 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
} 