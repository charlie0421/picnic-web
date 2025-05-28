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

    console.log("🍎 Apple OAuth 콜백 수신:", request.url);
    console.log(
      "🍎 쿼리 파라미터:",
      Object.fromEntries(searchParams.entries()),
    );

    // URL의 모든 쿼리 파라미터를 가져와서 그대로 전달
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });

    // 현재 호스트를 동적으로 감지하여 리다이렉트 URL 생성
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Apple 로그인 콜백 페이지로 리다이렉트
    const redirectUrl = `${baseUrl}/auth/callback/apple?${params.toString()}`;

    console.log("🍎 Apple OAuth 콜백 프록시 리다이렉트:", redirectUrl);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("🚨 Apple OAuth 콜백 프록시 오류:", error);

    // 현재 호스트를 동적으로 감지하여 오류 페이지로 리다이렉트
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    return NextResponse.redirect(`${baseUrl}/?error=auth_callback_failed`);
  }
}

export async function POST(request: NextRequest) {
  // Apple은 때때로 POST로 콜백을 보낼 수 있음
  return GET(request);
}
