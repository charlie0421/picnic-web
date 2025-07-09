import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server';

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

    // 임시 구현 - 빈 데이터 반환
    return NextResponse.json({
      success: true,
      data: [],
      pagination: {
        page,
        limit,
        totalCount: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      },
      message: '이 기능은 현재 개발 중입니다.'
    });

  } catch (error) {
    console.error('충전 내역 조회 에러:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 