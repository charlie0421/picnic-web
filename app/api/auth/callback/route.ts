import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 만약 소셜 로그인 제공자로부터 'next' 파라미터를 받는다면,
  // 로그인 후 해당 경로로 리디렉션할 수 있습니다.
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 인증 실패 또는 오류 시 에러 페이지로 리디렉션합니다.
  const errorRedirectUrl = new URL('/auth/auth-code-error', origin);
  errorRedirectUrl.searchParams.set('error', 'Authentication Failed');
  errorRedirectUrl.searchParams.set(
    'error_description',
    'Could not exchange authorization code for a session.'
  );

  return NextResponse.redirect(errorRedirectUrl);
} 