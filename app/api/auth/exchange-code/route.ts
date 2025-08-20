import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSocialAuthService } from '@/lib/supabase/social/service';

// 모든 OAuth 제공자 동일 처리: 간단하고 일관된 Supabase 표준 OAuth

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 [API] OAuth 코드 교환 시작');
    
    const body = await request.json();
    const { code, provider, user, id_token, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'OAuth 코드가 필요합니다', success: false },
        { status: 400 }
      );
    }

    console.log('🔐 [API] OAuth 코드 수신:', { 
      code: code.substring(0, 10) + '...', 
      provider,
      hasAppleUser: !!user,
      hasAppleIdToken: !!id_token
    });

    // 🚀 서버사이드 Supabase 클라이언트 생성
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

    console.log('🔧 [API] 서버사이드 Supabase 클라이언트 생성 완료');

    // 모든 제공자 동일 처리: 표준 Supabase OAuth만 사용

    // 🌐 모든 제공자 공통: 표준 Supabase OAuth 사용
    console.log('🌐 [API] 표준 Supabase OAuth 사용 (모든 제공자 동일)');
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('❌ [API] OAuth 코드 교환 실패:', error);
      return NextResponse.json(
        { 
          error: `OAuth 코드 교환 실패: ${error.message}`, 
          success: false,
          details: error 
        },
        { status: 400 }
      );
    }

    if (!data?.session) {
      console.error('❌ [API] 세션이 생성되지 않음');
      return NextResponse.json(
        { error: '세션이 생성되지 않았습니다', success: false },
        { status: 400 }
      );
    }

    console.log('✅ [API] OAuth 인증 성공:', {
      hasSession: !!data.session,
      hasUser: !!data.user,
      userId: data.user?.id?.substring(0, 8) + '...',
      provider: data.user?.app_metadata?.provider
    });

    // 🍎 Apple 특화 프로필 처리 (또는 다른 소셜 프로필 처리)
    if (provider && ['apple', 'google'].includes(provider)) {
      try {
        console.log(`🔧 [API] ${provider} 프로필 처리 시작`);
        
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
        
        if (callbackResult.success) {
          console.log(`✅ [API] ${provider} 프로필 처리 성공`);
        } else {
          console.error(`❌ [API] ${provider} 프로필 처리 실패:`, callbackResult.error?.message);
        }
      } catch (profileError) {
        console.error(`❌ [API] ${provider} 프로필 처리 중 오류:`, profileError);
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

  } catch (error: any) {
    console.error('❌ [API] 서버 오류:', error);
    return NextResponse.json(
      { 
        error: `서버 오류: ${error.message}`, 
        success: false,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 