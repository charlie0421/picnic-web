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

    // 전체 통계 조회
    // 1. 총 사용한 스타캔디 계산
    const { data: totalStarCandyData } = await supabase
      .from('vote_pick')
      .select('amount')
      .eq('user_id', user.id)
      .is('deleted_at', null);
    
    const totalStarCandyUsed = totalStarCandyData?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;

    // 2. 응원한 고유 아티스트 수 계산
    const { data: uniqueArtistsData, error: artistsError } = await supabase
      .from('vote_pick')
      .select('vote_item_id')
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (artistsError) {
      console.error('고유 아티스트 조회 실패:', artistsError);
      // 이 오류는 전체 로직을 중단시키지 않음
    }

    const uniqueArtistVoteItemIds = new Set(uniqueArtistsData?.map(item => item.vote_item_id).filter(Boolean));
    
    let totalSupportedArtists = 0;
    if (uniqueArtistVoteItemIds.size > 0) {
      const { data: artistIds, error: artistIdError } = await supabase
        .from('vote_item')
        .select('artist_id')
        .in('id', Array.from(uniqueArtistVoteItemIds));

      if (artistIdError) {
        console.error('아티스트 ID 조회 실패:', artistIdError);
      } else {
        totalSupportedArtists = new Set(artistIds?.map(item => item.artist_id)).size;
      }
    }


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
    const transformedHistory = voteHistory?.map(item => {
      const voteData = Array.isArray(item.vote) ? item.vote[0] : item.vote;
      const voteItemData = Array.isArray(item.vote_item) ? item.vote_item[0] : item.vote_item;
      
      let artistData: any = null;
      if (voteItemData) {
        artistData = Array.isArray(voteItemData.artist) ? voteItemData.artist[0] : voteItemData.artist;
      }

      let artistGroupData: any = null;
      if (artistData) {
        artistGroupData = Array.isArray(artistData.artist_group) ? artistData.artist_group[0] : artistData.artist_group;
      }

      return {
        id: item.id,
        voteId: item.vote_id,
        voteItemId: item.vote_item_id,
        amount: item.amount,
        createdAt: item.created_at,
        vote: voteData ? {
          id: voteData.id,
          title: safeMultiLangText(voteData.title),
          startAt: voteData.start_at,
          stopAt: voteData.stop_at,
          mainImage: voteData.main_image,
          area: voteData.area || '',
          voteCategory: safeMultiLangText(voteData.vote_category)
        } : null,
        voteItem: voteItemData ? {
          id: voteItemData.id,
          artistId: voteItemData.artist_id,
          groupId: voteItemData.group_id,
          artist: artistData ? {
            id: artistData.id,
            name: safeMultiLangText(artistData.name),
            image: artistData.image,
            artistGroup: artistGroupData ? {
              id: artistGroupData.id,
              name: safeMultiLangText(artistGroupData.name)
            } : null
          } : null
        } : null
      };
    }) || [];

    return NextResponse.json({
      success: true,
      data: transformedHistory,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
        hasNext: offset + limit < (totalCount || 0)
      },
      statistics: {
        totalStarCandyUsed,
        totalSupportedArtists
      }
    });

  } catch (error) {
    console.error('투표 내역 API 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
} 