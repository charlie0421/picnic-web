import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClientWithCookies } from '@/lib/supabase/server';

/**
 * 인증 상태 검증 API 엔드포인트
 * AuthRedirectHandler에서 사용자의 인증 상태를 검증하는 데 사용됩니다.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [Auth Verify API] 인증 상태 검증 요청 받음');

    // 공통 서버 클라이언트(쿠키 연동) 사용하여 다른 API와 동일 프로젝트/쿠키를 참조
    const supabase = await createServerSupabaseClientWithCookies();

    console.log('🔍 [Auth Verify API] Supabase 클라이언트 생성 완료');

    // 먼저 빠른 사용자 정보 확인 (getUser는 getSession보다 빠르고 안정적)
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    console.log('🔍 [Auth Verify API] 사용자 조회 결과:', {
      hasUser: !!userData?.user,
      userId: userData?.user?.id,
      userError: userError?.message,
    });
    
    if (userError || !userData?.user) {
      console.warn('⚠️ [Auth Verify API] 사용자 정보 조회 오류 또는 사용자 없음:', userError);
      return NextResponse.json(
        { 
          valid: false, 
          error: 'User authentication failed',
          message: '사용자 인증에 실패했습니다.'
        }, 
        { status: 401 }
      );
    }

    // 주의: getUser()가 성공했다면 토큰이 유효함을 의미
    // 별도의 세션 만료 체크는 getUser() 호출 자체에서 처리됨


    // 사용자 프로필 존재 확인 (선택적)
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, email, deleted_at')
        .eq('id', userData.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = row not found
        console.warn('⚠️ [Auth Verify API] 프로필 조회 오류:', profileError);
      }

      // 삭제된 사용자 체크
      if (profile?.deleted_at) {
        console.warn('🗑️ [Auth Verify API] 삭제된 사용자 계정');
        return NextResponse.json(
          { 
            valid: false, 
            error: 'Account deleted',
            message: '삭제된 계정입니다.'
          }, 
          { status: 401 }
        );
      }
    } catch (profileError) {
      console.warn('⚠️ [Auth Verify API] 프로필 체크 중 오류 (진행 계속):', profileError);
      // 프로필 체크 실패는 인증 실패로 처리하지 않음
    }

    const provider = userData.user.app_metadata?.provider;

    console.log('✅ [Auth Verify API] 인증 상태 검증 성공:', {
      userId: userData.user.id,
      email: userData.user.email,
      provider: provider || 'email',
    });

    return NextResponse.json({
      valid: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
        provider: provider || 'email',
      },
    });
  } catch (error) {
    console.error('💥 [Auth Verify API] 처리 중 오류:', error);
    
    return NextResponse.json(
      { 
        valid: false, 
        error: 'Internal server error',
        message: '서버 내부 오류가 발생했습니다.'
      }, 
      { status: 500 }
    );
  }
}

/**
 * OPTIONS 요청 처리 (CORS 지원)
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}