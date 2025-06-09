import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface AppleAuthRequest {
  code: string;
  user?: any;
  state?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AppleAuthRequest = await request.json();
    const { code, user, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code가 필요합니다' },
        { status: 400 }
      );
    }

    // Supabase 클라이언트 생성
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Apple OAuth 콜백 처리
    const { data, error } = await supabase.auth.exchangeCodeForSession(`apple_${code}`);
    
    if (error) {
      console.error('Apple OAuth 처리 실패:', error);
      return NextResponse.json(
        { error: `Apple OAuth 처리 실패: ${error.message}` },
        { status: 400 }
      );
    }

    if (!data?.session) {
      return NextResponse.json(
        { error: 'Apple OAuth 세션 생성 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Apple OAuth 성공',
      authData: {
        isAppleVerified: true,
        user: data.session.user,
        session: data.session
      }
    });
  } catch (error) {
    console.error('Apple OAuth API 에러:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}