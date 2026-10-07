import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextRequest, NextResponse } from 'next/server';
import { logSafeError } from '@/utils/log-safe-error';
import { createClient } from '@supabase/supabase-js';
import { verifyAppleIdentityToken, normalizeAppleProfile } from '@/lib/supabase/social/apple';

interface AppleAuthRequest {
  id_token: string;
  user?: any; // Apple에서 첫 로그인 시 제공하는 사용자 정보
  state?: string;
}

export const POST = withSafeErrors('auth.apple.post.unhandled', async function POST(request: NextRequest) {
  try {
    const body: AppleAuthRequest = await request.json();
    const { id_token, user, state } = body;

    if (!id_token) {
      return NextResponse.json(
        { error: 'Apple ID 토큰이 필요합니다' },
        { status: 400 }
      );
    }

    // Apple ID 토큰을 JWKS로 암호학적 검증
    let tokenPayload: Record<string, any>;
    try {
      tokenPayload = await verifyAppleIdentityToken(id_token);
    } catch (verifyError) {
      logSafeError('auth.apple.token_verify.failed', verifyError);
      return NextResponse.json(
        { error: 'Apple ID 토큰 검증 실패' },
        { status: 401 }
      );
    }

    if (!tokenPayload || !tokenPayload.sub) {
      return NextResponse.json(
        { error: 'Apple ID 토큰에 필수 클레임이 없습니다' },
        { status: 400 }
      );
    }

    // Apple 프로필 정보 정규화
    const userProfile = normalizeAppleProfile(tokenPayload, user);


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
    logSafeError('auth.apple.failed', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다' },
      { status: 500 }
    );
  }
});
