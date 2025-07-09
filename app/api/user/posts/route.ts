import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // 1. 인증된 사용자 확인
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // 3. Supabase 클라이언트 생성
    const supabase = await createServerSupabaseClient();

    // 4. 총 게시물 수 조회 (삭제되지 않은 것만)
    const { count: totalCount, error: countError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (countError) {
      console.error('게시물 수 조회 에러:', countError);
      return NextResponse.json(
        { success: false, error: '게시물 수 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 5. 게시물 목록 조회 (게시판 정보 포함)
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        post_id,
        title,
        content,
        view_count,
        created_at,
        is_anonymous,
        boards (
          board_id,
          name
        )
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (postsError) {
      console.error('게시물 조회 에러:', postsError);
      return NextResponse.json(
        { success: false, error: '게시물 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 6. 각 게시물의 댓글 수를 별도 조회
    const postIds = posts?.map(p => p.post_id) || [];
    let commentCounts: { [key: string]: number } = {};
    
    if (postIds.length > 0) {
      const { data: commentData } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds)
        .is('deleted_at', null);
      
      // 댓글 수 계산
      commentData?.forEach(comment => {
        commentCounts[comment.post_id] = (commentCounts[comment.post_id] || 0) + 1;
      });
    }

    // 7. 데이터 변환
    const formattedPosts = posts?.map(post => {
      // 게시판 이름 추출 (다국어 지원)
      let boardName: string | null = null;
      if ((post as any).boards?.name) {
        const boardNameObj = (post as any).boards.name;
        if (typeof boardNameObj === 'object') {
          boardName = boardNameObj.ko || boardNameObj.en || 'Unknown Board';
        } else if (typeof boardNameObj === 'string') {
          boardName = boardNameObj;
        }
      }

      return {
        id: post.post_id,
        title: post.title || '제목 없음',
        content: post.content || '',
        viewCount: post.view_count || 0,
        commentCount: commentCounts[post.post_id] || 0,
        createdAt: post.created_at,
        boardName,
        isAnonymous: post.is_anonymous || false
      };
    }) || [];

    // 8. 페이지네이션 계산
    const totalPages = Math.ceil((totalCount || 0) / limit);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    return NextResponse.json({
      success: true,
      data: formattedPosts,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages,
        hasNext,
        hasPrevious
      }
    });

  } catch (error) {
    console.error('게시물 내역 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 