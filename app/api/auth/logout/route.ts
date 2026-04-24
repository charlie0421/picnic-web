/**
 * Server-side Logout API Endpoint
 * 
 * This endpoint handles server-side session invalidation and cleanup
 * when users log out from the Picnic application.
 */

import { NextResponse, NextRequest } from 'next/server';
import { SupabaseAuthError } from '@/lib/supabase/error';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Allow-listed origins for CORS preflight + same-site/CSRF checks on logout.
 *
 * SECURITY:
 *   - Previously this endpoint advertised `Access-Control-Allow-Origin: *` and had no
 *     CSRF protection, meaning any third-party site could force a logged-in user to
 *     log out (a low-impact CSRF, but still unwanted UX manipulation).
 *   - We now restrict to a server-controlled allow-list and additionally require the
 *     POST to look same-origin (Sec-Fetch-Site, Origin, or Referer).
 *
 * The list is derived from env so production/staging can differ without a redeploy
 * of this file. Localhost variants are added in non-production for dev convenience.
 */
function getAllowedOrigins(): string[] {
  const origins = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    try {
      // Normalize (strip trailing slash) and validate.
      const u = new URL(value);
      origins.add(`${u.protocol}//${u.host}`);
    } catch {
      // ignore malformed env values
    }
  };

  add(process.env.NEXT_PUBLIC_SITE_URL);
  add(process.env.BASE_URL);
  add(process.env.NEXT_PUBLIC_STAGING_URL);
  // Sensible production fallback so we are never wide-open if env is missing.
  add('https://www.picnic.fan');

  if (process.env.NODE_ENV !== 'production') {
    add('http://localhost:3000');
    add('http://localhost:3100');
  }

  return Array.from(origins);
}

function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const normalized = `${u.protocol}//${u.host}`;
    return getAllowedOrigins().includes(normalized);
  } catch {
    return false;
  }
}

/**
 * CSRF check for the logout POST.
 *
 * Strategy (defense in depth):
 *   1. If `Sec-Fetch-Site` is present (modern browsers), require `same-origin` /
 *      `same-site` / `none` (`none` = direct user navigation, e.g. typing the URL).
 *   2. If `Sec-Fetch-Site` is absent (older browsers, server-to-server, curl), fall
 *      back to validating `Origin` or `Referer` against the allow-list. We never
 *      assume an absent header means "trusted".
 */
function isSameSiteRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    return (
      secFetchSite === 'same-origin' ||
      secFetchSite === 'same-site' ||
      secFetchSite === 'none'
    );
  }

  // Fallback for legacy clients without Sec-Fetch-Site.
  const origin = request.headers.get('origin');
  if (origin) return isAllowedOrigin(origin);

  const referer = request.headers.get('referer');
  if (referer) return isAllowedOrigin(referer);

  // No origin signals at all — refuse rather than assume same-site.
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: CSRF / cross-site origin guard. Without this, a third-party site
    // could submit a form / fetch to /api/auth/logout and forcibly log the user out.
    if (!isSameSiteRequest(request)) {
      return NextResponse.json(
        { error: 'Forbidden: cross-site logout requests are not allowed.' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);

    // fetch API로 호출된 경우 JSON 응답, 브라우저 직접 접근(form submit 포함)시 리다이렉트.
    //
    // SECURITY: We deliberately do NOT treat `Accept: */*` as a fetch signal. A
    // classic <form method="POST"> submit sends `Accept: text/html,...,*/*` which
    // would have matched the old wildcard branch and silently swallowed a CSRF
    // attempt as JSON instead of producing the visible redirect that would tip
    // the victim off. We require an explicit fetch signal instead.
    const acceptHeader = request.headers.get('accept') || '';
    const secFetchMode = request.headers.get('sec-fetch-mode');
    const isFetchRequest =
      acceptHeader.includes('application/json') ||
      request.headers.get('x-requested-with') === 'XMLHttpRequest' ||
      secFetchMode === 'cors';

    // fetch 요청이면 JSON 응답 준비, 아니면 리다이렉트 응답
    const response = isFetchRequest
      ? NextResponse.json({ success: true, message: 'Logged out successfully' })
      : NextResponse.redirect(`${url.origin}/`, 303);

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            response.cookies.set({ name, value, ...options, path: '/', sameSite: 'lax' });
          },
          remove(name: string, options: any) {
            response.cookies.set({ name, value: '', ...options, path: '/', maxAge: 0, sameSite: 'lax' });
          },
        },
      }
    );

    // 🔧 scope: 'local' 사용 - 429 무한 루프 방지
    // 'global'은 Supabase 서버에 추가 요청을 보내 Rate Limit 상황에서 또 429를 유발할 수 있음
    // 'local'은 서버 호출 없이 쿠키만 정리하므로 안전함
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      // 로컬 로그아웃 실패는 거의 발생하지 않지만, 발생해도 쿠키 정리는 계속 진행
      console.warn('[/api/auth/logout] Supabase local signOut warning:', error);
    }

    // 추가적으로 흔히 남는 인증 관련 쿠키들을 정리 (보강)
    try {
      const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL!.split('.')[0].split('://')[1];
      const base = `sb-${projectId}-auth-token`;
      const names: string[] = [
        base,
        `${base}-code-verifier`,
        'sb-auth-token',
        'supabase-auth-token',
        'sb-api-auth-token',
      ];
      // 분할 쿠키 최대 10개까지 제거 시도 (.0 ~ .9)
      for (let i = 0; i < 10; i++) names.push(`${base}.${i}`);

      // 현재 호스트와 최상위 도메인(추정) 두 가지로 삭제 시도 (localhost 포함)
      const host = url.hostname; // localhost 또는 www.picnic.fan 등
      const parts = host.split('.');
      const apex = parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : host;

      const paths = ['/', '/auth', '/api', '/en', '/ko', '/ja'];
      const domains = Array.from(new Set([
        undefined, // host-only (no domain)
        host,
        `.${apex}`,
        host !== 'localhost' ? '.localhost' : undefined,
      ].filter(Boolean))) as (string | undefined)[];

      names.forEach((name) => {
        paths.forEach((path) => {
          domains.forEach((domain) => {
            response.cookies.set({
              name,
              value: '',
              path,
              sameSite: 'lax',
              maxAge: 0,
              expires: new Date(0),
              ...(domain ? { domain } : {}),
            } as any);
          });
        });
      });
    } catch {}

    // 강력 캐시/쿠키 무효화 힌트
    // 주의: storage를 포함하면 localStorage까지 삭제되어 'picnic_last_login' 보존이 불가하므로 제외
    response.headers.set('Cache-Control', 'no-store');
    try {
      response.headers.set('Clear-Site-Data', '"cookies"');
    } catch {}
    return response;
  } catch (error) {
    console.error('[/api/auth/logout] error:', error);
    const status = error instanceof SupabaseAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Logout failed' },
      { status }
    );
  }
}

/**
 * GET /api/auth/logout
 * 
 * Returns logout status and debugging information
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === 'true';

    if (debug && process.env.NODE_ENV === 'development') {
      // Return basic debugging information in development
      return NextResponse.json({
        endpoint: '/api/auth/logout',
        methods: ['POST', 'GET'],
        description: 'Server-side logout endpoint',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
      });
    }

    return NextResponse.json({
      message: 'Logout endpoint is active',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('로그아웃 상태 조회 중 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/logout
 *
 * CORS preflight handler.
 *
 * SECURITY: We do NOT echo `Access-Control-Allow-Origin: *` anymore. We only
 * echo the request `Origin` if it appears in the allow-list (see
 * `getAllowedOrigins`). Browsers will block the preflight (and therefore the
 * actual POST) for any other origin, which neutralizes cross-site forced-logout
 * attacks via fetch() with credentials.
 *
 * Including `Vary: Origin` is required so caches don't serve a response keyed
 * for one origin to another origin.
 */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const headers: Record<string, string> = {
    'Allow': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  const requestOrigin = request.headers.get('origin');
  if (isAllowedOrigin(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin as string;
  }
  // If the origin is not allowed, we deliberately omit Allow-Origin so the
  // browser blocks the cross-site request.

  return new NextResponse(null, {
    status: 204,
    headers,
  });
}