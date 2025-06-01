import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 서버사이드 로그아웃 API 엔드포인트
 * 클라이언트에서 호출하여 서버사이드 세션을 무효화합니다.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚪 [Logout API] 서버사이드 로그아웃 요청 받음');

    // 서버사이드 Supabase 클라이언트 생성
    const supabase = createServerSupabaseClient();

    // 현재 세션 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.warn('⚠️ [Logout API] 세션 조회 오류:', sessionError);
    }

    // 사용자 정보 로깅 (로그아웃 전)
    if (session?.user) {
      console.log('👤 [Logout API] 로그아웃 사용자:', {
        userId: session.user.id,
        email: session.user.email,
        provider: session.user.app_metadata?.provider,
      });
    }

    // 서버사이드 세션 무효화
    const { error: signOutError } = await supabase.auth.signOut();
    
    if (signOutError) {
      console.error('❌ [Logout API] 서버 로그아웃 오류:', signOutError);
      return NextResponse.json(
        { 
          success: false, 
          error: signOutError.message,
          message: '서버사이드 로그아웃 실패'
        }, 
        { status: 500 }
      );
    }

    // 응답 헤더에 쿠키 제거 지시
    const response = NextResponse.json({ 
      success: true,
      message: '서버사이드 세션이 성공적으로 무효화되었습니다.'
    });

    // 서버사이드 인증 관련 쿠키들 제거
    const cookiesToClear = [
      'sb-auth-token',
      'supabase-auth-token',
      'auth-session',
      'session-token',
    ];

    cookiesToClear.forEach(cookieName => {
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    });

    console.log('✅ [Logout API] 서버사이드 로그아웃 완료');
    
    return response;

  } catch (error) {
    console.error('💥 [Logout API] 서버 로그아웃 예외:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '알 수 없는 오류',
        message: '서버사이드 로그아웃 중 예외 발생'
      }, 
      { status: 500 }
    );
  }
}

/**
 * GET 요청도 지원 (브라우저에서 직접 호출 가능)
 */
export async function GET(request: NextRequest) {
  console.log('🌐 [Logout API] GET 요청으로 로그아웃 시도');
  return POST(request);
}