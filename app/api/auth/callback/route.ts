import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@/config/settings';

function isValidInternalRedirect(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  try {
    const url = new URL(path, 'http://localhost');
    if (url.origin !== 'http://localhost') return false;
  } catch { return false; }
  return true;
}

function extractLangFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const match = path.match(/^\/([a-z]{2}(-[a-z]{2})?)(?=\/|$)/i);
  if (!match) return null;
  const candidate = match[1].toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate)
    ? candidate
    : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 만약 소셜 로그인 제공자로부터 'next' 파라미터를 받는다면,
  // 로그인 후 해당 경로로 리디렉션할 수 있습니다.
  const rawNext = searchParams.get('next') ?? '/';
  const next = isValidInternalRedirect(rawNext) ? rawNext : '/';

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

    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 탈퇴(soft delete) 처리된 계정은 로그인 차단
      // 신규 가입의 경우 user_profiles row가 아직 생성되지 않았을 수 있으며,
      // 이때는 maybeSingle() → null 이 반환되어 profile?.deleted_at === undefined 로 평가되므로
      // 차단되지 않고 정상 가입 플로우로 진행된다 (기대 동작).
      const userId = exchangeData?.user?.id;
      if (userId) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('deleted_at')
            .eq('id', userId)
            .maybeSingle();

          if (!profileError && profile?.deleted_at) {
            console.warn('🗑️ [Auth Callback] 탈퇴 계정 로그인 차단:', { userId });

            // 세션 즉시 종료 (쿠키 삭제까지 포함)
            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.warn('⚠️ [Auth Callback] signOut 중 오류:', signOutError);
            }

            // 로그인 페이지는 /[lang]/login 구조이므로 lang prefix 필요
            const lang =
              extractLangFromPath(next) ||
              extractLangFromPath(rawNext) ||
              (cookieStore.get('locale')?.value &&
              (SUPPORTED_LANGUAGES as readonly string[]).includes(
                cookieStore.get('locale')!.value,
              )
                ? cookieStore.get('locale')!.value
                : null) ||
              DEFAULT_LANGUAGE;

            const withdrawnRedirectUrl = new URL(`${origin}/${lang}/login`);
            withdrawnRedirectUrl.searchParams.set('error', 'withdrawn');
            const withdrawnResponse = NextResponse.redirect(withdrawnRedirectUrl);

            // exchange 단계에서 set 된 쿠키를 모두 무효화
            for (const cookie of redirectResponse.cookies.getAll()) {
              const cookieOptions: any = {
                path: '/',
                sameSite: 'lax',
                maxAge: 0,
              };
              if (secure) cookieOptions.secure = true;
              if (cookieDomain) cookieOptions.domain = cookieDomain;
              withdrawnResponse.cookies.set({
                name: cookie.name,
                value: '',
                ...cookieOptions,
              });
            }

            return withdrawnResponse;
          }
        } catch (withdrawalCheckError) {
          console.error(
            '❌ [Auth Callback] 탈퇴 여부 확인 중 오류:',
            withdrawalCheckError,
          );
          // 안전 측면에서 확인 실패 시에는 로그인 진행 (기존 동작 유지)
        }
      }

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