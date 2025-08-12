import { NextRequest, NextResponse } from 'next/server';
import { getWeChatUserInfo } from '@/lib/supabase/social/wechat';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * WeChat OAuth 토큰 교환 및 프로필 조회 API (POST)
 * Body: { code: string, state?: string }
 * 응답: { success: true, tokens: {...}, profile: {...} }
 */
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: 'WeChat 인증 코드가 필요합니다.' },
        { status: 400 }
      );
    }

    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'WeChat 환경변수(NEXT_PUBLIC_WECHAT_APP_ID / WECHAT_APP_SECRET)가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 토큰 교환 (문서: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)
    const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    tokenUrl.searchParams.set('appid', appId);
    tokenUrl.searchParams.set('secret', appSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('grant_type', 'authorization_code');

    const tokenRes = await fetch(tokenUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { error: `WeChat 토큰 교환 실패: ${text}` },
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json();

    // 에러 코드 처리
    if (tokenData.errcode) {
      return NextResponse.json(
        { error: `WeChat 오류: ${tokenData.errmsg} (${tokenData.errcode})` },
        { status: 502 }
      );
    }

    const accessToken: string | undefined = tokenData.access_token;
    const openid: string | undefined = tokenData.openid;

    if (!accessToken || !openid) {
      return NextResponse.json(
        { error: 'WeChat 액세스 토큰 또는 OpenID가 응답에 없습니다.' },
        { status: 502 }
      );
    }

    // 사용자 정보 조회 및 정규화
    const profile = await getWeChatUserInfo(accessToken, openid);

    // 안정적인 파생 토큰 생성 (비공식 id_token 대체)
    const derivedIdToken = crypto
      .createHmac('sha256', appSecret)
      .update(openid)
      .digest('hex');

    return NextResponse.json({
      success: true,
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        scope: tokenData.scope,
        openid: tokenData.openid,
        unionid: tokenData.unionid,
        id_token: derivedIdToken,
      },
      profile,
    });
  } catch (error: any) {
    console.error('WeChat API 처리 오류:', error);
    return NextResponse.json(
      { error: error?.message || '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}


