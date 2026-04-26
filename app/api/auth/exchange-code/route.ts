import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSocialAuthService } from '@/lib/supabase/social/service';

// 모든 OAuth 제공자 동일 처리: 간단하고 일관된 Supabase 표준 OAuth

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, provider, user, id_token, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'OAuth 코드가 필요합니다', success: false },
        { status: 400 }
      );
    }

    // 서버사이드 Supabase 클라이언트 생성
    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            // 분할 쿠키가 생성될 수 있도록 넓은 경로/도메인 설정을 허용
            cookieStore.set({ name, value, ...options, path: '/', sameSite: 'lax' });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options, path: '/', sameSite: 'lax' });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // SECURITY: never echo Supabase auth error details to clients —
      // they leak project metadata and internal state useful to attackers.
      console.error('❌ [API] OAuth 코드 교환 실패:', error);
      return NextResponse.json(
        { error: 'OAuth 코드 교환 실패', success: false },
        { status: 400 }
      );
    }

    if (!data?.session) {
      return NextResponse.json(
        { error: '세션이 생성되지 않았습니다', success: false },
        { status: 400 }
      );
    }

    // 로그인 직후: IP/국가 추적 함수 호출(비차단, 실패 무시)
    try {
      supabase
        .functions
        .invoke('track-country', { body: { source: 'login' } })
        .catch(() => {});
    } catch {
      // track-country 실패는 무시
    }

    // 🍎 Apple 특화 프로필 처리 (또는 다른 소셜 프로필 처리)
    if (provider && ['apple', 'google'].includes(provider)) {
      try {
        // SocialAuthService를 통한 프로필 처리
        const socialAuthService = getSocialAuthService(supabase);
        
        // Apple 특화 파라미터 준비
        const callbackParams: Record<string, string> = {};
        if (provider === 'apple') {
          if (user) callbackParams.user = user;
          if (id_token) callbackParams.id_token = id_token;
          if (state) callbackParams.state = state;
        }
        
        // 콜백 처리 (프로필 생성/업데이트)
        const callbackResult = await socialAuthService.handleCallback(
          provider as any,
          callbackParams
        );
        
        if (!callbackResult.success) {
          console.error(`[API] ${provider} 프로필 처리 실패:`, callbackResult.error?.message);
        }
      } catch (profileError) {
        console.error(`[API] ${provider} 프로필 처리 중 오류:`, profileError);
        // 프로필 처리 실패해도 로그인 자체는 성공으로 처리
      }
    }

    return NextResponse.json({
      success: true,
      message: 'OAuth 인증 성공',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        provider: data.user?.app_metadata?.provider
      }
    });

  } catch (error) {
    // SECURITY: stack traces and raw error messages must not reach API
    // responses, even in development — client-side telemetry can capture
    // them and forward to third parties.
    console.error('[API] exchange-code 서버 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', success: false },
      { status: 500 }
    );
  }
}