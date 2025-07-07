import { createServerSupabaseClientWithCookies } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * 사용자 최근 로그인 정보 업데이트 API
 * 로그인 성공시 호출되어 최근 로그인 수단과 시간을 반환합니다. (로컬 스토리지 저장용)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [Update Last Login API] 최근 로그인 정보 요청 받음');

    // App Router에서 쿠키를 읽을 수 있는 서버사이드 Supabase 클라이언트 생성
    const cookieStore = await cookies();
    
    const supabase = createServerSupabaseClientWithCookies({
      get: (name: string) => {
        const cookie = cookieStore.get(name);
        return cookie ? { name: cookie.name, value: cookie.value } : undefined;
      },
      set: (cookie: { name: string; value: string; [key: string]: any }) => {
        cookieStore.set(cookie.name, cookie.value, cookie);
      }
    });

    // 인증된 사용자 확인
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData?.user) {
      console.warn('⚠️ [Update Last Login API] 인증되지 않은 요청:', userError);
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
    const user = userData.user;

    // Provider 정보 추출 (Supabase auth에서 가져오기)
    let provider = 'email'; // 기본값
    let providerDisplayName = '이메일';
    
    // user.identities에서 provider 정보 확인
    console.log('🔍 [Update Last Login API] 사용자 identity 정보:', {
      userId: user.id?.substring(0, 8) + '...',
      identitiesCount: user.identities?.length || 0,
      allIdentities: user.identities?.map((identity, index) => ({
        index,
        id: identity.id?.substring(0, 8) + '...',
        provider: identity.provider,
        identity_data: {
          email: identity.identity_data?.email,
          name: identity.identity_data?.name,
          full_name: identity.identity_data?.full_name,
          sub: identity.identity_data?.sub
        }
      })) || []
    });
    
    if (user.identities && user.identities.length > 0) {
      const identity = user.identities[0]; // 첫 번째 identity 사용
      provider = identity.provider || 'email';
      
      console.log('🎯 [Update Last Login API] Provider 감지 결과:', {
        detectedProvider: provider,
        identityId: identity.id?.substring(0, 8) + '...',
        identityProvider: identity.provider
      });
      
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
    } else {
      console.warn('⚠️ [Update Last Login API] 사용자 identities가 없습니다. 기본값 사용.');
    }

    const loginInfo = {
      user_id: currentUserId,
      last_login_provider: provider,
      last_login_provider_display: providerDisplayName,
      last_login_at: new Date().toISOString()
    };

    console.log('📝 [Update Last Login API] 로그인 정보 생성:', loginInfo);

    console.log('✅ [Update Last Login API] 로그인 정보 반환 (로컬 스토리지 저장용)');

    return NextResponse.json({
      success: true,
      message: '최근 로그인 정보를 반환했습니다.',
      data: loginInfo
    });

  } catch (error) {
    console.error('💥 [Update Last Login API] 처리 중 오류:', error);
    
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 