import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextRequest, NextResponse } from "next/server";
import { logSafeError } from '@/utils/log-safe-error';
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

// Next.js 15.3.1에서는 GET 핸들러도 기본적으로 캐싱되지 않도록 변경되었습니다.
// 필요한 경우 dynamic = 'force-static' 또는 fetchCache = 'default-cache' 옵션을 사용할 수 있습니다.
export const dynamic = "force-dynamic"; // 요청마다 OAuth URL 을 새로 만든다

/**
 * Google OAuth 시작 API (GET)
 *
 * 이 API는 Google OAuth 로그인 프로세스를 시작합니다.
 * Supabase의 signInWithOAuth를 사용하여 Google OAuth URL을 생성하고
 * 클라이언트를 해당 URL로 리다이렉트합니다.
 */
export const GET = withSafeErrors('auth.google.get.unhandled', async function GET(request: NextRequest) {
  try {
    // 서버 측 Supabase 클라이언트 생성
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Use BASE_URL env var instead of Host header to prevent host header injection
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.BASE_URL || "https://www.picnic.fan";
    const redirectTo = `${baseUrl}/auth/callback/google`;

    // 클라이언트가 전송한 return_url 쿼리를 그대로 전달해 복귀 경로 보존
    const url = new URL(request.url);
    const returnUrl = url.searchParams.get('return_url') || undefined;

    // Supabase를 통한 Google OAuth 로그인 시작
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
          ...(returnUrl ? { return_url: returnUrl } : {}),
        },
      },
    });

    if (error) {
      logSafeError('auth.google.start.failed', error);
      return NextResponse.json(
        { error: 'Google OAuth 시작 실패' },
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
    logSafeError('auth.google.get.failed', error);
    return NextResponse.json(
      { error: '서버 내부 오류가 발생했습니다' },
      { status: 500 }
    );
  }
});
