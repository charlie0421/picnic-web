import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 인증 상태 검증 API 엔드포인트
 * AuthRedirectHandler에서 사용자의 인증 상태를 검증하는 데 사용됩니다.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [Auth Verify API] 인증 상태 검증 요청 받음');

    // 서버사이드 Supabase 클라이언트 생성
    const supabase = createServerSupabaseClient();

    // 현재 세션 확인
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.warn('⚠️ [Auth Verify API] 세션 조회 오류:', sessionError);
      return NextResponse.json(
        { 
          valid: false, 
          error: 'Session retrieval failed',
          message: '세션 조회에 실패했습니다.'
        }, 
        { status: 401 }
      );
    }

    // 세션이 없는 경우
    if (!session || !session.user) {
      console.log('❌ [Auth Verify API] 세션이 없음');
      return NextResponse.json(
        { 
          valid: false, 
          error: 'No session found',
          message: '활성 세션이 없습니다.'
        }, 
        { status: 401 }
      );
    }

    // 세션 만료 체크
    const now = new Date();
    const expiryTime = new Date(session.expires_at! * 1000);
    
    if (now >= expiryTime) {
      console.warn('⏰ [Auth Verify API] 세션이 만료됨');
      return NextResponse.json(
        { 
          valid: false, 
          error: 'Session expired',
          message: '세션이 만료되었습니다.'
        }, 
        { status: 401 }
      );
    }

    // 사용자 정보 확인
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData.user) {
      console.warn('⚠️ [Auth Verify API] 사용자 정보 조회 오류:', userError);
      return NextResponse.json(
        { 
          valid: false, 
          error: 'User data retrieval failed',
          message: '사용자 정보 조회에 실패했습니다.'
        }, 
        { status: 401 }
      );
    }

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

    // WeChat 로그인 특별 검증
    const provider = session.user.app_metadata?.provider;
    if (provider === 'wechat') {
      console.log('🔄 [Auth Verify API] WeChat 로그인 특별 검증');
      
      // WeChat 토큰 유효성 추가 검증 (필요시 구현)
      // 현재는 기본 세션 검증으로 충분
    }

    console.log('✅ [Auth Verify API] 인증 상태 검증 성공:', {
      userId: userData.user.id,
      email: userData.user.email,
      provider: provider || 'email',
      expiresAt: new Date(session.expires_at! * 1000).toISOString(),
    });

    // 성공 응답
    return NextResponse.json({ 
      valid: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
        provider: provider || 'email',
      },
      session: {
        expiresAt: new Date(session.expires_at! * 1000).toISOString(),
      },
      message: '인증 상태가 유효합니다.'
    });

  } catch (error) {
    console.error('💥 [Auth Verify API] 검증 중 예외 발생:', error);
    
    return NextResponse.json(
      { 
        valid: false, 
        error: error instanceof Error ? error.message : '알 수 없는 오류',
        message: '인증 상태 검증 중 오류가 발생했습니다.'
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