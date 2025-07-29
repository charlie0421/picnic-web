/**
 * Server-side Logout API Endpoint
 * 
 * This endpoint handles server-side session invalidation and cleanup
 * when users log out from the Picnic application.
 */

import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupabaseAuthError } from '@/lib/supabase/error';

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new SupabaseAuthError('Logout failed.', 500);
    }

    return new Response(null, { status: 204 });
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