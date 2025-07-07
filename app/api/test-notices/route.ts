import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    console.log('🔍 [Test Notices API] 시작');
    
    const supabase = await createServerSupabaseClient();
    console.log('🔍 [Test Notices API] Supabase 클라이언트 생성 완료');

    // 1. 전체 notices 테이블 데이터 확인
    const { data: allNotices, error: allError } = await supabase
      .from('notices')
      .select('*');

    console.log('🔍 [Test Notices API] 전체 공지사항 조회 결과:', {
      hasData: !!allNotices,
      count: allNotices?.length || 0,
      hasError: !!allError,
      error: allError?.message || null
    });

    // 2. 상태별 공지사항 확인
    const { data: publishedNotices, error: publishedError } = await supabase
      .from('notices')
      .select('*')
      .eq('status', 'published');

    console.log('🔍 [Test Notices API] 발행된 공지사항 조회 결과:', {
      hasData: !!publishedNotices,
      count: publishedNotices?.length || 0,
      hasError: !!publishedError,
      error: publishedError?.message || null
    });

    // 3. 첫 번째 공지사항 상세 정보 확인
    if (allNotices && allNotices.length > 0) {
      const firstNotice = allNotices[0];
      console.log('🔍 [Test Notices API] 첫 번째 공지사항 상세:', {
        id: firstNotice.id,
        title: firstNotice.title,
        status: firstNotice.status,
        is_pinned: firstNotice.is_pinned,
        created_at: firstNotice.created_at
      });
    }

    return NextResponse.json({
      success: true,
      debug: {
        allNoticesCount: allNotices?.length || 0,
        publishedNoticesCount: publishedNotices?.length || 0,
        allNotices: allNotices || [],
        publishedNotices: publishedNotices || [],
        errors: {
          allError: allError?.message || null,
          publishedError: publishedError?.message || null
        }
      }
    });

  } catch (error) {
    console.error('🚨 [Test Notices API] 에러:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
} 