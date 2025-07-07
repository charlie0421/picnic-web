import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// 모든 OAuth 제공자 동일 처리: 간단하고 일관된 Supabase 표준 OAuth

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 [API] OAuth 코드 교환 시작');
    
    const { code, provider } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: 'OAuth 코드가 필요합니다', success: false },
        { status: 400 }
      );
    }

    console.log('🔐 [API] OAuth 코드 수신:', { 
      code: code.substring(0, 10) + '...', 
      provider 
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
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
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