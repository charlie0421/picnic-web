import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import {
  normalizeGoogleProfile,
  parseGoogleIdToken,
} from "@/lib/supabase/social/google";

// Next.js 15.3.1에서는 GET 핸들러도 기본적으로 캐싱되지 않도록 변경되었습니다.
// 필요한 경우 dynamic = 'force-static' 또는 fetchCache = 'default-cache' 옵션을 사용할 수 있습니다.
export const dynamic = "force-dynamic"; // POST 요청이므로 항상 동적으로 처리

/**
 * Google OAuth 시작 API (GET)
 *
 * 이 API는 Google OAuth 로그인 프로세스를 시작합니다.
 * Supabase의 signInWithOAuth를 사용하여 Google OAuth URL을 생성하고
 * 클라이언트를 해당 URL로 리다이렉트합니다.
 */
export async function GET(request: NextRequest) {
  try {
    // 서버 측 Supabase 클라이언트 생성
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // 현재 호스트를 동적으로 감지하여 리다이렉트 URL 생성
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // 리다이렉트 URL 설정
    const redirectTo = `${baseUrl}/auth/callback/google`;

    // Supabase를 통한 Google OAuth 로그인 시작
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error('Google OAuth 시작 실패:', error);
      return NextResponse.json(
        { error: `Google OAuth 시작 실패: ${error.message}` },
        { status: 400 }
      );
    }

    // OAuth URL로 리다이렉트
    if (data.url) {
      return NextResponse.redirect(data.url);
    }

    return NextResponse.json(
      { error: "OAuth URL을 생성할 수 없습니다." },
      { status: 500 }
    );
  } catch (error) {
    console.error('Google OAuth GET API 에러:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

/**
 * Google OAuth 토큰 교환 API (POST)
 *
 * 이 API는 Google OAuth 콜백으로부터 받은 코드를 사용하여
 * 액세스 토큰과 사용자 정보를 가져오는 역할을 합니다.
 * 주로 Supabase 콜백 처리 이후 추가 작업이 필요한 경우 사용됩니다.
 */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const { code, idToken } = requestBody;

    // 필수 파라미터 검증
    if (!code && !idToken) {
      return NextResponse.json(
        { error: "코드 또는 ID 토큰이 필요합니다." },
        { status: 400 }
      );
    }

    // 서버 측 Supabase 클라이언트 생성
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // 서비스 롤 키 사용 (주의: 서버 측에서만 사용)
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // ID 토큰이 제공된 경우, 해당 토큰 파싱 및 검증
    if (idToken) {
      try {
        const payload = parseGoogleIdToken(idToken);
        const userProfile = normalizeGoogleProfile(payload);

        return NextResponse.json({
          success: true,
          profile: userProfile,
        });
      } catch (error) {
        console.error('ID 토큰 검증 실패:', error);
        return NextResponse.json(
          { error: "ID 토큰 검증 실패" },
          { status: 400 }
        );
      }
    }

    // 코드가 제공된 경우, Google API로 토큰 교환
    // 이 로직은 주로 Supabase가 처리하지 못하는 특수한 경우에만 필요합니다.
    // 일반적인 OAuth 흐름에서는 Supabase의 콜백 처리를 사용하는 것이 권장됩니다.
    
    // 클라이언트 ID와 시크릿이 환경 변수에 설정되어 있어야 함
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // 현재 호스트를 동적으로 감지하여 리다이렉트 URL 생성
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/auth/callback/google`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Google OAuth 클라이언트 ID 또는 시크릿이 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    // Google OAuth 토큰 교환 요청
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store", // Next.js 15.3.1에서 명시적으로 no-store 설정
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('토큰 교환 실패:', errorData);
      return NextResponse.json(
        { error: `토큰 교환 실패: ${errorData.error}` },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();

    // 액세스 토큰을 사용하여 사용자 정보 가져오기
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        cache: "no-store", // Next.js 15.3.1에서 명시적으로 no-store 설정
      },
    );

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.json();
      console.error('사용자 정보 가져오기 실패:', errorData);
      return NextResponse.json(
        { error: "사용자 정보 가져오기 실패" },
        { status: 400 }
      );
    }

    const userData = await userInfoResponse.json();
    const userProfile = normalizeGoogleProfile(userData);

    return NextResponse.json({
      success: true,
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        id_token: tokenData.id_token,
        expires_in: tokenData.expires_in,
      },
      profile: userProfile,
    });
  } catch (error) {
    console.error('Google OAuth POST API 에러:', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
