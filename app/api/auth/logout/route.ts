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

export async function POST(request: NextRequest) {
  try {
    // 현재 호스트 기반 리다이렉트 응답 생성 (브라우저가 쿠키 반영을 더 확실히 처리)
    const url = new URL(request.url);
    const response = NextResponse.redirect(`${url.origin}/`, 303);

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

    const { error } = await supabase.auth.signOut({ scope: 'global' });

    if (error) {
      throw new SupabaseAuthError('Logout failed.', 500);
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

    // 강력 캐시/쿠키/스토리지 무효화 힌트
    response.headers.set('Cache-Control', 'no-store');
    try {
      response.headers.set('Clear-Site-Data', '"cookies", "storage"');
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
      // Return debugging information in development
      return NextResponse.json({
        endpoint: '/api/auth/logout',
        methods: ['POST', 'GET'],
        description: 'Server-side logout endpoint',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        features: {
          supabase_logout: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          redis_cache: !!process.env.REDIS_URL,
          audit_logging: (process.env.NODE_ENV as string) === 'production'
        }
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
 * CORS preflight handler
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}