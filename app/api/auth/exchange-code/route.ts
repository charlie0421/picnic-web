import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 [API] OAuth 코드 교환 시작 (서버사이드 RLS 우회)');
    
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

    // 🚀 서버사이드 Supabase 클라이언트 생성 (Next.js 15 호환)
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

    // 🚀 서버에서 OAuth 코드 교환 (RLS 문제 없음)
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

    // 🎯 응답에 성공 정보 포함
    const response = NextResponse.json({
      success: true,
      message: 'OAuth 인증 성공',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        provider: data.user?.app_metadata?.provider
      }
    });

    // 🔧 쿠키에 세션 정보 설정 (자동으로 처리됨)
    console.log('🍪 [API] 세션 쿠키 설정 완료');

    return response;

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