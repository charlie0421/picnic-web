import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 만약 소셜 로그인 제공자로부터 'next' 파라미터를 받는다면,
  // 로그인 후 해당 경로로 리디렉션할 수 있습니다.
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();
    const reqHeaders = await headers();
    const host = reqHeaders.get('host');
    const proto = reqHeaders.get('x-forwarded-proto') || (origin.startsWith('https://') ? 'https' : 'http');
    const isLocal = host?.includes('localhost') || host?.startsWith('127.') || host?.endsWith('.local');
    const cookieDomain = !isLocal && (host === 'picnic.fan' || host?.endsWith('.picnic.fan')) ? '.picnic.fan' : undefined;
    const secure = proto === 'https' && !isLocal;

    // 동일 origin으로 리디렉트
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
            const base = { path: '/', sameSite: 'lax' as const };
            redirectResponse.cookies.set({ name, value, ...base, ...(secure ? { secure: true } : {}), ...(cookieDomain ? { domain: cookieDomain } : {}), ...options });
          },
          remove(name: string, options: any) {
            const base = { path: '/', sameSite: 'lax' as const };
            redirectResponse.cookies.set({ name, value: '', ...base, ...(secure ? { secure: true } : {}), ...(cookieDomain ? { domain: cookieDomain } : {}), ...options });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // verify 호출 없이 바로 리디렉션
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