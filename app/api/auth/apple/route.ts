import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseAppleIdentityToken, normalizeAppleProfile } from '@/lib/supabase/social/apple';

interface AppleAuthRequest {
  id_token: string;
  user?: any; // Apple에서 첫 로그인 시 제공하는 사용자 정보
  state?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AppleAuthRequest = await request.json();
    const { id_token, user, state } = body;

    if (!id_token) {
      return NextResponse.json(
        { error: 'Apple ID 토큰이 필요합니다' },
        { status: 400 }
      );
    }

    console.log('🍎 [Apple API] ID 토큰 처리 시작');

    // Apple ID 토큰 파싱
    const tokenPayload = parseAppleIdentityToken(id_token);
    
    if (!tokenPayload || !tokenPayload.sub) {
      console.error('🍎 [Apple API] ID 토큰 파싱 실패');
      return NextResponse.json(
        { error: 'Apple ID 토큰 파싱 실패' },
        { status: 400 }
      );
    }

    console.log('🍎 [Apple API] ID 토큰 파싱 성공:', {
      sub: tokenPayload.sub,
      email: tokenPayload.email,
      email_verified: tokenPayload.email_verified,
      hasUserData: !!user
    });

    // Apple 프로필 정보 정규화
    const userProfile = normalizeAppleProfile(tokenPayload, user);

    console.log('🍎 [Apple API] 프로필 정규화 완료:', userProfile);

    return NextResponse.json({
      success: true,
      message: 'Apple ID 토큰 검증 성공',
      profile: {
        id: userProfile.id,
        name: userProfile.name || '',
        email: userProfile.email || '',
        avatar: null, // Apple은 프로필 이미지 제공 안함
        verified: userProfile.email_verified || false,
        provider: 'apple'
      }
    });
  } catch (error) {
    console.error('🍎 [Apple API] 에러:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}