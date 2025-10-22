import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { SupabaseAuthError } from './error'
import { createClient } from '@supabase/supabase-js'

function resolveCookieDomain(hostname: string | null | undefined) {
  if (!hostname) return undefined;
  // 로컬/개발 환경: 도메인 강제 설정 금지 (host-only 쿠키)
  if (
    hostname.includes('localhost') ||
    hostname.startsWith('127.') ||
    hostname.endsWith('.local')
  ) {
    return undefined;
  }
  // 프로덕션 도메인: picnic.fan 하위 도메인에서만 루트 도메인으로 고정
  if (hostname === 'picnic.fan' || hostname.endsWith('.picnic.fan')) {
    return '.picnic.fan';
  }
  // 이외 호스트(프리뷰/브랜치 등): 잘못된 크로스 도메인 방지를 위해 도메인 미설정
  return undefined;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in environment variables.");
  }
  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in environment variables.");
  }

  const reqHeaders = headers();
  const currentHost = reqHeaders.get('host');
  const cookieDomain = resolveCookieDomain(currentHost);

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            const sanitized: CookieOptions = { ...options };
            // 도메인 강제/제거 정책 적용
            if (cookieDomain) {
              sanitized.domain = cookieDomain;
            } else if (sanitized.domain) {
              delete sanitized.domain;
            }
            cookieStore.set({ name, value, ...sanitized })
          } catch (error) {
            // The `set` method was called from a Server Component.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            const sanitized: CookieOptions = { ...options };
            if (cookieDomain) {
              sanitized.domain = cookieDomain;
            } else if (sanitized.domain) {
              delete sanitized.domain;
            }
            cookieStore.set({ name, value: '', ...sanitized })
          } catch (error) {
            // The `delete` method was called from a Server Component.
          }
        },
      },
    }
  )
}

export function createPublicSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not set in environment variables.");
  }
  if (!supabaseAnonKey) {
    throw new Error("SUPABASE_ANON_KEY is not set in environment variables.");
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
  );
}

// ------------------- 호환성을 위한 별칭 함수들 -------------------

/** @deprecated use createSupabaseServerClient instead */
export const createServerSupabaseClient = createSupabaseServerClient;

/** @deprecated use createSupabaseServerClient instead */
export const createServerSupabaseClientWithCookies = createSupabaseServerClient;

/** @deprecated use createSupabaseServerClient instead */
export const createPublicSupabaseClient = createPublicSupabaseServerClient;


export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.warn(`[Auth] Supabase getUser error: ${error.message}`);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('[Auth] Unexpected error in getServerUser:', error);
    return null;
  }
}

export async function withAuth<T>(
  callback: (userId: string) => Promise<T>
): Promise<T> {
  const user = await getServerUser();
  if (!user) {
    throw new SupabaseAuthError('Authentication required.');
  }
  return callback(user.id);
} 