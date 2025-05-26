import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { code, user, state } = await request.json();
    
    console.log('🍎 Apple API 라우트 호출:', {
      code: code ? 'present' : 'missing',
      user: user ? 'present' : 'missing',
      state: state ? 'present' : 'missing',
    });

    if (!code) {
      return NextResponse.json(
        { success: false, message: 'Authorization code가 없습니다.' },
        { status: 400 }
      );
    }

    // Supabase 클라이언트 생성
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Apple OAuth 콜백 처리 시도
    try {
      console.log('Supabase Apple OAuth 처리 시작...');
      
      // Supabase의 Apple OAuth 처리
      const { data, error } = await supabase.auth.exchangeCodeForSession(`apple_${code}`);
      
      if (error) {
        console.error('Supabase Apple OAuth 오류:', error);

        return NextResponse.json({
          success: false,
          message: `Apple OAuth 처리 실패: ${error.message}`,
          debug: {
            originalError: error.message,
            code,
            hasUser: !!user,
            hasState: !!state
          }
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: 'Apple OAuth 성공',
        authData: {
          isAppleVerified: true,
          user: data?.session?.user,
          session: data?.session
        }
      });
      
    } catch (supabaseError) {
      console.error('Supabase 처리 중 예외:', supabaseError);
      
      return NextResponse.json({
        success: false,
        message: `Supabase 처리 실패: ${supabaseError}`,
        debug: {
          error: String(supabaseError),
          code,
          hasUser: !!user,
          hasState: !!state
        }
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Apple API 라우트 오류:', error);

    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      debug: String(error)
    }, { status: 500 });
  }
}