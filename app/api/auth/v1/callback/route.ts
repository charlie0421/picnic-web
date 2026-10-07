import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextRequest, NextResponse } from "next/server";
import { logSafeError } from '@/utils/log-safe-error';

/**
 * Supabase Apple OAuth 콜백 프록시
 *
 * Supabase가 기대하는 /api/auth/v1/callback URL을
 * 실제 앱의 콜백 페이지로 리다이렉트합니다.
 */
export const GET = withSafeErrors('auth.v1.callback.get.unhandled', async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

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

    // 환경 변수에서 안전한 base URL 사용 (Host 헤더 주입 방지)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.BASE_URL || "https://www.picnic.fan";

    const redirectUrl = `${baseUrl}/auth/callback/${provider}?${params.toString()}`;
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    // 오류 메시지에 리다이렉트 주소(쿼리의 OAuth code 포함)가 들어갈 수 있다. 오류 이름만 남긴다.
    logSafeError('auth.v1.callback.failed', error);

    // 환경 변수에서 안전한 base URL 사용 (Host 헤더 주입 방지)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.BASE_URL || "https://www.picnic.fan";

    return NextResponse.redirect(`${baseUrl}/?error=auth_callback_failed`);
  }
});

export const POST = withSafeErrors('auth.v1.callback.post.unhandled', async function POST(request: NextRequest) {
  // 일부 제공자는 POST로 콜백을 보낼 수 있음
  return GET(request);
});
