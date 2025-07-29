import { createServerSupabaseClientWithCookies } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * 사용자 프로필 정보 API 엔드포인트
 * 캔디 개수를 포함한 사용자 프로필 정보를 반환합니다.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [User Profile API] 사용자 프로필 요청 받음');

    // URL에서 userId 파라미터 추출
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    // App Router에서 쿠키를 읽을 수 있는 서버사이드 Supabase 클라이언트 생성
    const supabase = await createServerSupabaseClientWithCookies();

    console.log('🔍 [User Profile API] Supabase 클라이언트 생성 완료');

    // 인증된 사용자 확인
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData?.user) {
      console.warn('⚠️ [User Profile API] 인증되지 않은 요청:', userError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized',
          message: '인증이 필요합니다.'
        }, 
        { status: 401 }
      );
    }

    const currentUserId = userData.user.id;
    
    // 요청된 사용자 ID가 현재 인증된 사용자와 다른 경우 권한 체크
    if (requestedUserId && requestedUserId !== currentUserId) {
      console.warn('⚠️ [User Profile API] 다른 사용자의 프로필 요청 시도:', {
        currentUserId,
        requestedUserId
      });
      return NextResponse.json(
        { 
          success: false,
          error: 'Forbidden',
          message: '다른 사용자의 프로필에 접근할 수 없습니다.'
        }, 
        { status: 403 }
      );
    }

    // 사용자 프로필 정보 조회 (캔디 정보 + 관리자 권한 포함)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        nickname,
        avatar_url,
        star_candy,
        star_candy_bonus,
        is_admin,
        is_super_admin,
        created_at,
        updated_at
      `)
      .eq('id', currentUserId)
      .single();

    if (profileError) {
      console.error('❌ [User Profile API] 프로필 조회 오류:', profileError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Profile not found',
          message: '사용자 프로필을 찾을 수 없습니다.'
        }, 
        { status: 404 }
      );
    }

    // Provider 정보 추출 (Supabase auth에서 가져오기)
    const user = userData.user;
    let provider = 'email'; // 기본값
    let providerDisplayName = '이메일';
    
    // user.identities에서 provider 정보 확인
    if (user.identities && user.identities.length > 0) {
      const identity = user.identities[0]; // 첫 번째 identity 사용
      provider = identity.provider || 'email';
      
      // Provider별 한국어 표시명 설정
      switch (provider) {
        case 'google':
          providerDisplayName = 'Google';
          break;
        case 'kakao':
          providerDisplayName = 'Kakao';
          break;
        case 'apple':
          providerDisplayName = 'Apple';
          break;
        case 'github':
          providerDisplayName = 'GitHub';
          break;
        case 'facebook':
          providerDisplayName = 'Facebook';
          break;
        case 'twitter':
          providerDisplayName = 'Twitter';
          break;
        case 'discord':
          providerDisplayName = 'Discord';
          break;
        case 'email':
        default:
          providerDisplayName = '이메일';
          break;
      }
    }

    console.log('✅ [User Profile API] 프로필 조회 성공:', {
      userId: profile.id,
      nickname: profile.nickname,
      star_candy: profile.star_candy,
      star_candy_bonus: profile.star_candy_bonus,
      total: (profile.star_candy || 0) + (profile.star_candy_bonus || 0),
      is_admin: profile.is_admin,
      is_super_admin: profile.is_super_admin,
      provider: provider,
      providerDisplayName: providerDisplayName
    });

    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.nickname,
        avatar_url: profile.avatar_url,
        star_candy: profile.star_candy || 0,
        star_candy_bonus: profile.star_candy_bonus || 0,
        total_candy: (profile.star_candy || 0) + (profile.star_candy_bonus || 0),
        is_admin: profile.is_admin || false,
        is_super_admin: profile.is_super_admin || false,
        provider: provider,
        provider_display_name: providerDisplayName,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      }
    });

  } catch (error) {
    console.error('💥 [User Profile API] 처리 중 오류:', error);
    
    return NextResponse.json(
      { 
        success: false,
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