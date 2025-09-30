import { NextRequest, NextResponse } from "next/server";

/**
 * Supabase Apple OAuth 콜백 프록시
 *
 * Supabase가 기대하는 /api/auth/v1/callback URL을
 * 실제 앱의 콜백 페이지로 리다이렉트합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    console.log("🔐 OAuth 콜백 수신:", request.url);
    console.log("🔐 쿼리 파라미터:", Object.fromEntries(searchParams.entries()));

    // URL의 모든 쿼리 파라미터를 가져와서 그대로 전달
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });

    // provider 결정 우선순위: explicit provider 쿼리 > redirect_to에서 추출 > 기본 'google'
    let provider = searchParams.get('provider') || undefined;
    if (!provider) {
      const redirectTo = searchParams.get('redirect_to');
      if (redirectTo) {
        try {
          const u = new URL(redirectTo);
          // 예상 경로: /auth/callback/<provider>
          const m = u.pathname.match(/^\/auth\/callback\/([a-z0-9_-]+)/i);
          if (m && m[1]) provider = m[1].toLowerCase();
        } catch {}
      }
    }
    if (!provider) provider = 'google';

    // 현재 호스트를 동적으로 감지하여 리다이렉트 URL 생성
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const redirectUrl = `${baseUrl}/auth/callback/${provider}?${params.toString()}`;
    console.log("🔐 OAuth 콜백 프록시 리다이렉트:", redirectUrl);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("🚨 OAuth 콜백 프록시 오류:", error);

    // 현재 호스트를 동적으로 감지하여 오류 페이지로 리다이렉트
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    return NextResponse.redirect(`${baseUrl}/?error=auth_callback_failed`);
  }
}

export async function POST(request: NextRequest) {
  // 일부 제공자는 POST로 콜백을 보낼 수 있음
  return GET(request);
}
