import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, createServerSupabaseClient } from '@/lib/supabase/server';

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  postTitle: string;
  postId: string;
  boardName: string | null;
  isAnonymous: boolean;
  likeCount: number;
  replyCount: number;
  parentCommentId: string | null;
  isHidden: boolean;
  locale: string | null;
}

interface CommentsResponse {
  success: boolean;
  data: CommentItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  statistics: {
    totalComments: number;
    totalLikes: number;
    totalBoards: number;
    mostActiveBoard: string | null;
  };
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    // 1. 인증된 사용자 확인
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
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

    // 4. 전체 댓글 수 조회 (통계용)
    const { count: totalCount, error: countError } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (countError) {
      console.error('Comments count error:', countError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch comments count' },
        { status: 500 }
      );
    }

    // 5. 댓글 데이터 조회 (posts, boards와 JOIN)
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        comment_id,
        content,
        created_at,
        likes,
        replies,
        parent_comment_id,
        is_hidden,
        locale,
        post_id,
        posts!inner (
          post_id,
          title,
          is_anonymous,
          board_id,
          boards (
            board_id,
            name
          )
        )
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (commentsError) {
      console.error('Comments fetch error:', commentsError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch comments' },
        { status: 500 }
      );
    }

    // 6. 통계 정보 계산
    const { data: statsData, error: statsError } = await supabase
      .from('comments')
      .select(`
        likes,
        posts!inner (
          boards (
            board_id,
            name
          )
        )
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null);

    let totalLikes = 0;
    const boardCounts: { [key: string]: number } = {};
    
    if (statsData && !statsError) {
      statsData.forEach((comment: any) => {
        totalLikes += comment.likes || 0;
        
        // Json 객체에서 게시판 이름 추출
        const boardNameObj = comment.posts?.boards?.name;
        let boardName: string | null = null;
        if (boardNameObj && typeof boardNameObj === 'object') {
          boardName = boardNameObj.ko || boardNameObj.en || 'Unknown Board';
        } else if (typeof boardNameObj === 'string') {
          boardName = boardNameObj;
        }
        
        if (boardName) {
          boardCounts[boardName] = (boardCounts[boardName] || 0) + 1;
        }
      });
    }

    const totalBoards = Object.keys(boardCounts).length;
    const mostActiveBoard = Object.keys(boardCounts).length > 0 
      ? Object.entries(boardCounts).sort(([,a], [,b]) => b - a)[0][0]
      : null;

    // 7. 데이터 변환
    const transformedComments: CommentItem[] = (comments || []).map((comment: any) => {
      // content가 JSON 형태인 경우 텍스트로 변환
      let contentText = '';
      if (comment.content) {
        if (typeof comment.content === 'string') {
          contentText = comment.content;
        } else if (Array.isArray(comment.content)) {
          // Quill Delta 형식인 경우
          contentText = comment.content
            .map((op: any) => typeof op.insert === 'string' ? op.insert : '')
            .join('')
            .replace(/\n+/g, ' ')
            .trim();
        } else if (typeof comment.content === 'object') {
          contentText = JSON.stringify(comment.content);
        }
      }

      // 로케일에 따른 게시판 이름 선택
      const locale = searchParams.get('locale') || 'ko';
      const board = comment.posts?.boards;
      let boardName: string | null = null;
      if (board?.name) {
        const boardNameObj = board.name;
        if (typeof boardNameObj === 'object') {
          switch (locale) {
            case 'en': boardName = boardNameObj.en || boardNameObj.ko || 'Unknown Board'; break;
            case 'ja': boardName = boardNameObj.ja || boardNameObj.ko || 'Unknown Board'; break;
            case 'zh': boardName = boardNameObj.zh || boardNameObj.ko || 'Unknown Board'; break;
            case 'id': boardName = boardNameObj.id || boardNameObj.ko || 'Unknown Board'; break;
            default: boardName = boardNameObj.ko || boardNameObj.en || 'Unknown Board'; break;
          }
        } else if (typeof boardNameObj === 'string') {
          boardName = boardNameObj;
        }
      }

      return {
        id: comment.comment_id,
        content: contentText,
        createdAt: comment.created_at,
        postTitle: comment.posts?.title || 'No title',
        postId: comment.posts?.post_id || comment.post_id,
        boardName: boardName,
        isAnonymous: comment.posts?.is_anonymous || false,
        likeCount: comment.likes || 0,
        replyCount: comment.replies || 0,
        parentCommentId: comment.parent_comment_id,
        isHidden: comment.is_hidden || false,
        locale: comment.locale
      };
    });

    // 8. 페이지네이션 정보 계산
    const totalPages = Math.ceil((totalCount || 0) / limit);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    // 9. 응답 데이터 구성
    const response: CommentsResponse = {
      success: true,
      data: transformedComments,
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        totalPages,
        hasNext,
        hasPrevious
      },
      statistics: {
        totalComments: totalCount || 0,
        totalLikes,
        totalBoards,
        mostActiveBoard
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Comments history fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Server error occurred',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
} 