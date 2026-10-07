import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextRequest, NextResponse } from 'next/server';
import { logSafeError } from '@/utils/log-safe-error';
import { createServerSupabaseClientWithCookies } from '@/lib/supabase/server';
import { AuthSessionMissingError } from '@supabase/supabase-js';

/**
 * 인증 상태 검증 API 엔드포인트
 * AuthRedirectHandler에서 사용자의 인증 상태를 검증하는 데 사용됩니다.
 */
export const GET = withSafeErrors('auth.verify.get.unhandled', async function GET(request: NextRequest) {
  try {

    // 공통 서버 클라이언트(쿠키 연동) 사용하여 다른 API와 동일 프로젝트/쿠키를 참조
    const supabase = await createServerSupabaseClientWithCookies();


    // 먼저 빠른 사용자 정보 확인 (getUser는 getSession보다 빠르고 안정적)
    const { data: userData, error: userError } = await supabase.auth.getUser();


    if (userError || !userData?.user) {
      if (userError && !(userError instanceof AuthSessionMissingError)) {
        logSafeError('auth.verify.user.failed', userError);
      }
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
        logSafeError('auth.verify.profile.failed', profileError);
        // 탈퇴 여부를 확인할 수 없으면 유효 세션으로 답하지 않는다(fail-closed)
        return NextResponse.json(
          { valid: false, error: 'Account check failed', message: '계정 상태를 확인할 수 없습니다.' },
          { status: 503 }
        );
      }

      // 삭제된 사용자 체크
      if (profile?.deleted_at) {
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
      logSafeError('auth.verify.profile.failed', profileError);
      return NextResponse.json(
        { valid: false, error: 'Account check failed', message: '계정 상태를 확인할 수 없습니다.' },
        { status: 503 }
      );
    }

    const provider = userData.user.app_metadata?.provider;


    return NextResponse.json({
      valid: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
        provider: provider || 'email',
      },
    });
  } catch (error) {
    logSafeError('auth.verify.failed', error);

    return NextResponse.json(
      {
        valid: false,
        error: 'Internal server error',
        message: '서버 내부 오류가 발생했습니다.'
      },
      { status: 500 }
    );
  }
});

/**
 * OPTIONS 요청 처리 (CORS 지원)
 */
export const OPTIONS = withSafeErrors('auth.verify.options.unhandled', async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
});
