import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 만약 소셜 로그인 제공자로부터 'next' 파라미터를 받는다면,
  // 로그인 후 해당 경로로 리디렉션할 수 있습니다.
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();
    // 미리 리다이렉트 응답을 생성하고, 쿠키 set/remove가 이 응답 객체에 기록되도록 설정
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            redirectResponse.cookies.set({ name, value, ...options, path: '/', sameSite: 'lax' });
          },
          remove(name: string, options: any) {
            redirectResponse.cookies.set({ name, value: '', ...options, path: '/', sameSite: 'lax' });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try { await fetch(`${origin}/api/auth/verify`, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }); } catch {}
      return redirectResponse;
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