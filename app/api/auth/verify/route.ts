import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface VerifyResponse {
  valid: boolean;
  authenticated: boolean;
  user_id?: string;
  session_expires_at?: number;
  error?: string;
  details?: string;
}

/**
 * 인증 상태 검증 API 엔드포인트
 * AuthRedirectHandler에서 사용자의 인증 상태를 검증하는 데 사용됩니다.
 */
export async function GET(request: NextRequest): Promise<NextResponse<VerifyResponse>> {
  const timestamp = new Date().toISOString();
  console.log(`🔍 [AuthVerify] ${timestamp} - 인증 검증 요청 시작`);

  try {
    // Supabase 클라이언트 생성
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ [AuthVerify] Supabase 환경 변수 누락');
      return NextResponse.json<VerifyResponse>({
        valid: false,
        authenticated: false,
        error: 'Server configuration error',
        details: 'Missing Supabase configuration'
      }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authorization 헤더에서 Bearer 토큰 추출
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.replace('Bearer ', '');

    // 쿠키에서 토큰 추출 (fallback)
    const cookies = request.headers.get('cookie');
    let sessionToken = bearerToken;

    if (!sessionToken && cookies) {
      // Supabase auth 쿠키 패턴 찾기
      const cookieMap: Record<string, string> = {};
      cookies.split(';').forEach(cookie => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          cookieMap[key] = decodeURIComponent(value);
        }
      });

      // 다양한 Supabase 쿠키 패턴 확인
      const possibleKeys = [
        'sb-auth-token',
        'supabase-auth-token',
        'supabase.auth.token'
      ];

      for (const key of possibleKeys) {
        if (cookieMap[key]) {
          sessionToken = cookieMap[key];
          break;
        }
      }

      // 쿠키 전체에서 supabase 관련 토큰 찾기
      if (!sessionToken) {
        Object.keys(cookieMap).forEach(key => {
          if (key.includes('supabase') && key.includes('auth')) {
            sessionToken = cookieMap[key];
          }
        });
      }
    }

    console.log(`🔑 [AuthVerify] 토큰 확인:`, {
      hasAuthHeader: !!authHeader,
      hasBearerToken: !!bearerToken,
      hasSessionToken: !!sessionToken,
      tokenLength: sessionToken?.length || 0
    });

    // 토큰이 없으면 인증되지 않은 상태
    if (!sessionToken) {
      console.log('❌ [AuthVerify] 토큰 없음 - 인증되지 않음');
      return NextResponse.json<VerifyResponse>({
        valid: false,
        authenticated: false,
        details: 'No authentication token found'
      });
    }

    // Supabase에서 현재 사용자 세션 확인
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser(sessionToken);

      if (userError) {
        console.warn('⚠️ [AuthVerify] Supabase 사용자 조회 오류:', userError.message);
        return NextResponse.json<VerifyResponse>({
          valid: false,
          authenticated: false,
          error: 'Authentication verification failed',
          details: userError.message
        });
      }

      if (!user) {
        console.log('❌ [AuthVerify] 사용자 정보 없음');
        return NextResponse.json<VerifyResponse>({
          valid: false,
          authenticated: false,
          details: 'User not found'
        });
      }

      // 사용자 프로필 확인 (추가 검증)
      try {
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, deleted_at')
          .eq('id', user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.warn('⚠️ [AuthVerify] 프로필 조회 오류:', profileError.message);
        }

        // 프로필이 삭제된 사용자는 인증 무효
        if (profile?.deleted_at) {
          console.warn('❌ [AuthVerify] 삭제된 사용자 프로필');
          return NextResponse.json<VerifyResponse>({
            valid: false,
            authenticated: false,
            details: 'User account is deactivated'
          });
        }
      } catch (profileError) {
        console.warn('⚠️ [AuthVerify] 프로필 확인 실패 (계속 진행):', profileError);
        // 프로필 조회 실패는 치명적이지 않음
      }

      // 세션 만료 시간 확인
      let sessionExpiresAt: number | undefined;
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (session?.expires_at) {
          sessionExpiresAt = session.expires_at;
          const expiryTime = new Date(session.expires_at * 1000);
          const now = new Date();
          
          if (now >= expiryTime) {
            console.warn('⏰ [AuthVerify] 세션 만료됨');
            return NextResponse.json<VerifyResponse>({
              valid: false,
              authenticated: false,
              details: 'Session expired'
            });
          }
        }
      } catch (sessionError) {
        console.warn('⚠️ [AuthVerify] 세션 확인 실패 (계속 진행):', sessionError);
      }

      console.log('✅ [AuthVerify] 인증 검증 성공:', {
        userId: user.id,
        email: user.email,
        sessionExpiresAt: sessionExpiresAt ? new Date(sessionExpiresAt * 1000).toISOString() : 'unknown'
      });

      return NextResponse.json<VerifyResponse>({
        valid: true,
        authenticated: true,
        user_id: user.id,
        session_expires_at: sessionExpiresAt
      });

    } catch (supabaseError) {
      console.error('💥 [AuthVerify] Supabase 검증 중 예외:', supabaseError);
      return NextResponse.json<VerifyResponse>({
        valid: false,
        authenticated: false,
        error: 'Authentication service error',
        details: supabaseError instanceof Error ? supabaseError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('💥 [AuthVerify] 검증 과정 중 예외:', error);
    return NextResponse.json<VerifyResponse>({
      valid: false,
      authenticated: false,
      error: 'Verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST 메서드도 지원 (동일한 로직)
export async function POST(request: NextRequest): Promise<NextResponse<VerifyResponse>> {
  return GET(request);
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